const { expect } = require('chai')
const { Sequelize } = require('sequelize')
const sinon = require('sinon')
const os = require('os')
const Path = require('path')
const fs = require('../../../server/libs/fsExtra')

const Database = require('../../../server/Database')
const ApiRouter = require('../../../server/routers/ApiRouter')
const CollectionController = require('../../../server/controllers/CollectionController')
const ApiCacheManager = require('../../../server/managers/ApiCacheManager')
const CacheManager = require('../../../server/managers/CacheManager')
const SocketAuthority = require('../../../server/SocketAuthority')
const Auth = require('../../../server/Auth')
const Logger = require('../../../server/Logger')

// 1x1 transparent png
const pngBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')

function makeUploadedFile(name, buffer) {
  return {
    name,
    mv: (path) => fs.writeFile(path, buffer)
  }
}

function makeRes() {
  return {
    sendStatus: sinon.spy(),
    status: sinon.stub().returnsThis(),
    send: sinon.spy(),
    json: sinon.spy(),
    set: sinon.spy(),
    sendFile: sinon.spy()
  }
}

describe('CollectionController', () => {
  /** @type {ApiRouter} */
  let apiRouter
  let metadataPath
  let originalMetadataPath
  let originalCachePaths
  let collection

  const user = {
    username: 'test',
    canUpdate: true,
    canUpload: true,
    canDelete: true,
    checkCanAccessLibrary: () => true
  }

  beforeEach(async () => {
    global.ServerSettings = {}
    metadataPath = await fs.mkdtemp(Path.join(os.tmpdir(), 'abs-collection-cover-'))
    originalMetadataPath = global.MetadataPath
    originalCachePaths = { CachePath: CacheManager.CachePath, CoverCachePath: CacheManager.CoverCachePath, ImageCachePath: CacheManager.ImageCachePath, ItemCachePath: CacheManager.ItemCachePath }
    global.MetadataPath = metadataPath
    await CacheManager.ensureCachePaths()

    Database.sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
    Database.sequelize.uppercaseFirst = (str) => (str ? `${str[0].toUpperCase()}${str.substr(1)}` : '')
    await Database.buildModels()

    apiRouter = new ApiRouter({
      auth: new Auth(),
      apiCacheManager: new ApiCacheManager()
    })

    const library = await Database.libraryModel.create({ name: 'Test Library', mediaType: 'book' })
    collection = await Database.collectionModel.create({ libraryId: library.id, name: 'Test Collection' })

    sinon.stub(Logger, 'info')
    sinon.stub(Logger, 'debug')
    sinon.stub(Logger, 'warn')
    sinon.stub(Logger, 'error')
    sinon.stub(SocketAuthority, 'emitter')
  })

  afterEach(async () => {
    sinon.restore()
    await Database.sequelize.sync({ force: true })
    await fs.remove(metadataPath)
    global.MetadataPath = originalMetadataPath
    Object.assign(CacheManager, originalCachePaths)
  })

  async function uploadPngCover() {
    const req = { user, collection, body: {}, files: { cover: makeUploadedFile('cover.png', pngBuffer) } }
    const res = makeRes()
    await CollectionController.uploadCover.bind(apiRouter)(req, res)
    return res
  }

  describe('uploadCover', () => {
    it('should return 403 if user cannot upload', async () => {
      const req = { user: { ...user, canUpload: false }, collection, body: { url: 'https://example.com/cover.jpg' } }
      const res = makeRes()
      await CollectionController.uploadCover.bind(apiRouter)(req, res)

      expect(res.sendStatus.calledWith(403)).to.be.true
    })

    it('should return 400 without file or url', async () => {
      const req = { user, collection, body: {} }
      const res = makeRes()
      await CollectionController.uploadCover.bind(apiRouter)(req, res)

      expect(res.status.calledWith(400)).to.be.true
    })

    it('should return 400 for a non http url', async () => {
      const req = { user, collection, body: { url: 'file:///etc/passwd' } }
      const res = makeRes()
      await CollectionController.uploadCover.bind(apiRouter)(req, res)

      expect(res.status.calledWith(400)).to.be.true
    })

    it('should save an uploaded cover and set coverPath', async () => {
      const res = await uploadPngCover()

      const expectedPath = Path.posix.join(metadataPath, 'collections', collection.id, 'cover.png')
      expect(res.json.calledOnce).to.be.true
      expect(res.json.firstCall.args[0]).to.deep.equal({ success: true, cover: expectedPath })
      expect(await fs.pathExists(expectedPath)).to.be.true

      await collection.reload()
      expect(collection.coverPath).to.equal(expectedPath)
      expect(collection.toOldJSON().coverPath).to.equal(expectedPath)
      expect(SocketAuthority.emitter.calledWith('collection_updated')).to.be.true
    })

    it('should reject an uploaded file that is not an image', async () => {
      const req = { user, collection, body: {}, files: { cover: makeUploadedFile('cover.png', Buffer.from('not an image')) } }
      const res = makeRes()
      await CollectionController.uploadCover.bind(apiRouter)(req, res)

      expect(res.status.calledWith(400)).to.be.true
      expect(await fs.pathExists(Path.join(metadataPath, 'collections', collection.id, 'cover'))).to.be.false

      await collection.reload()
      expect(collection.coverPath).to.be.null
    })
  })

  describe('removeCover', () => {
    it('should remove the cover file and unset coverPath', async () => {
      await uploadPngCover()
      await collection.reload()

      const res = makeRes()
      await CollectionController.removeCover.bind(apiRouter)({ user, collection }, res)

      expect(res.sendStatus.calledWith(200)).to.be.true
      expect(await fs.pathExists(Path.join(metadataPath, 'collections', collection.id))).to.be.false

      await collection.reload()
      expect(collection.coverPath).to.be.null
      expect(collection.toOldJSON().coverPath).to.be.null
    })

    it('should return 200 if collection has no cover', async () => {
      const res = makeRes()
      await CollectionController.removeCover.bind(apiRouter)({ user, collection }, res)

      expect(res.sendStatus.calledWith(200)).to.be.true
      expect(SocketAuthority.emitter.called).to.be.false
    })
  })

  describe('getCover', () => {
    it('should send the raw cover file', async () => {
      await uploadPngCover()
      await collection.reload()

      const res = makeRes()
      await CollectionController.getCover.bind(apiRouter)({ params: { id: collection.id }, query: { raw: '1' }, headers: {} }, res)

      expect(res.sendFile.calledWith(collection.coverPath)).to.be.true
    })

    it('should return 404 if collection has no cover', async () => {
      const res = makeRes()
      await CollectionController.getCover.bind(apiRouter)({ params: { id: collection.id }, query: { raw: '1' }, headers: {} }, res)
      expect(res.sendStatus.calledWith(404)).to.be.true

      const res2 = makeRes()
      await CollectionController.getCover.bind(apiRouter)({ params: { id: collection.id }, query: {}, headers: {} }, res2)
      expect(res2.sendStatus.calledWith(404)).to.be.true
    })

    it('should return 400 for an invalid collection id', async () => {
      const res = makeRes()
      await CollectionController.getCover.bind(apiRouter)({ params: { id: '../../etc' }, query: {}, headers: {} }, res)

      expect(res.sendStatus.calledWith(400)).to.be.true
    })

    it('should not require authentication', () => {
      const auth = new Auth()
      expect(auth.authNotNeeded({ method: 'GET', path: `/api/collections/${collection.id}/cover` })).to.be.true
      expect(auth.authNotNeeded({ method: 'POST', path: `/api/collections/${collection.id}/cover` })).to.be.false
      expect(auth.authNotNeeded({ method: 'GET', path: `/api/collections/${collection.id}` })).to.be.false
    })
  })

  describe('delete', () => {
    it('should remove the cover when the collection is deleted', async () => {
      await uploadPngCover()
      await collection.reload()

      const res = makeRes()
      await CollectionController.delete.bind(apiRouter)({ user, collection }, res)

      expect(res.sendStatus.calledWith(200)).to.be.true
      expect(await fs.pathExists(Path.join(metadataPath, 'collections', collection.id))).to.be.false
    })
  })

  describe('middleware', () => {
    it('should allow removing the cover with update permission only', async () => {
      const next = sinon.spy()
      const req = { method: 'DELETE', path: `/collections/${collection.id}/cover`, params: { id: collection.id }, user: { ...user, canDelete: false } }
      const res = makeRes()
      await CollectionController.middleware.bind(apiRouter)(req, res, next)

      expect(next.calledOnce).to.be.true
    })

    it('should not allow removing the cover without update permission', async () => {
      const next = sinon.spy()
      const req = { method: 'DELETE', path: `/collections/${collection.id}/cover`, params: { id: collection.id }, user: { ...user, canUpdate: false } }
      const res = makeRes()
      await CollectionController.middleware.bind(apiRouter)(req, res, next)

      expect(next.called).to.be.false
      expect(res.sendStatus.calledWith(403)).to.be.true
    })

    it('should still require delete permission to delete the collection', async () => {
      const next = sinon.spy()
      const req = { method: 'DELETE', path: `/collections/${collection.id}`, params: { id: collection.id }, user: { ...user, canDelete: false } }
      const res = makeRes()
      await CollectionController.middleware.bind(apiRouter)(req, res, next)

      expect(next.called).to.be.false
      expect(res.sendStatus.calledWith(403)).to.be.true
    })
  })
})
