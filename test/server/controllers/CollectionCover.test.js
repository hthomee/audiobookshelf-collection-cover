const { expect } = require('chai')
const { Sequelize } = require('sequelize')
const sinon = require('sinon')
const express = require('express')
const http = require('http')
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

function postMultipartCover(port, urlPath, buffer) {
  return new Promise((resolve, reject) => {
    const boundary = '----AbsCollectionCoverTestBoundary'
    const payload = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="cover"; filename="cover.png"\r\nContent-Type: image/png\r\n\r\n`),
      buffer,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ])
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: urlPath,
        method: 'POST',
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': payload.length }
      },
      (res) => {
        res.resume()
        res.on('end', () => resolve(res.statusCode))
      }
    )
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

async function withApiServer(apiRouter, reqUser, fn) {
  const app = express()
  app.use((req, res, next) => {
    req.user = reqUser
    next()
  })
  app.use('/api', apiRouter.router)
  const server = http.createServer(app)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    return await fn(server.address().port)
  } finally {
    await new Promise((resolve) => server.close(resolve))
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

describe('CollectionController collection cover', () => {
  /** @type {ApiRouter} */
  let apiRouter
  let metadataPath
  let originalMetadataPath
  let originalCachePaths
  let collection

  const user = {
    id: 'user-id',
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
    sinon.stub(SocketAuthority, 'clientEmitter')
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
      expect(SocketAuthority.clientEmitter.calledWith('user-id', 'collection_updated')).to.be.true
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
      expect(SocketAuthority.clientEmitter.called).to.be.false
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

  describe('routes', () => {
    it('should check permissions before parsing the multipart upload', () => {
      const layer = apiRouter.router._router.stack.find((l) => l.route?.path === '/collections/:id/cover' && l.route.methods.post)
      expect(layer).to.exist
      const names = layer.route.stack.map((s) => s.handle.name)
      expect(names.indexOf('requireUploadPermission')).to.be.greaterThan(0)
      expect(names.indexOf('fileUploadParser')).to.be.greaterThan(names.indexOf('requireUploadPermission'))
      expect(names.indexOf('fileUploadParser')).to.equal(names.length - 2)
    })

    it('should accept a multipart cover upload over http', async () => {
      const status = await withApiServer(apiRouter, user, (port) => postMultipartCover(port, `/api/collections/${collection.id}/cover`, pngBuffer))

      expect(status).to.equal(200)
      await collection.reload()
      expect(collection.coverPath).to.equal(Path.posix.join(metadataPath, 'collections', collection.id, 'cover.png'))
      expect(await fs.pathExists(collection.coverPath)).to.be.true
    })

    it('should reject a multipart upload without upload permission before writing temp files', async () => {
      const status = await withApiServer(apiRouter, { ...user, canUpload: false }, (port) => postMultipartCover(port, `/api/collections/${collection.id}/cover`, pngBuffer))

      expect(status).to.equal(403)
      const tmpDir = Path.join(metadataPath, 'tmp')
      const leftovers = (await fs.pathExists(tmpDir)) ? (await fs.readdir(tmpDir)).filter((name) => name.startsWith('tmp-')) : []
      expect(leftovers).to.deep.equal([])
      await collection.reload()
      expect(collection.coverPath).to.be.null
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
