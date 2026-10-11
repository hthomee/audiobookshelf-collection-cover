const { expect } = require('chai')
const { Sequelize } = require('sequelize')
const sinon = require('sinon')

const Database = require('../../../server/Database')
const ApiRouter = require('../../../server/routers/ApiRouter')
const CollectionController = require('../../../server/controllers/CollectionController')
const ApiCacheManager = require('../../../server/managers/ApiCacheManager')
const SocketAuthority = require('../../../server/SocketAuthority')
const Auth = require('../../../server/Auth')

describe('CollectionController.create', () => {
  /** @type {ApiRouter} */
  let apiRouter
  let library

  const user = {
    username: 'test',
    canUpdate: true,
    checkCanAccessLibrary: () => true
  }

  function makeRes() {
    return {
      json: sinon.spy(),
      status: sinon.stub().returnsThis(),
      send: sinon.spy(),
      sendStatus: sinon.spy()
    }
  }

  beforeEach(async () => {
    global.ServerSettings = {}
    Database.sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
    Database.sequelize.uppercaseFirst = (str) => (str ? `${str[0].toUpperCase()}${str.substr(1)}` : '')
    await Database.buildModels()

    apiRouter = new ApiRouter({
      auth: new Auth(),
      apiCacheManager: new ApiCacheManager()
    })

    library = await Database.libraryModel.create({ name: 'Test Library', mediaType: 'book' })
    sinon.stub(SocketAuthority, 'emitter')
  })

  afterEach(async () => {
    sinon.restore()
    await Database.sequelize.sync({ force: true })
  })

  it('should create an empty collection when no books are passed', async () => {
    const req = { user, body: { libraryId: library.id, name: 'Empty collection' } }
    const res = makeRes()
    await CollectionController.create.bind(apiRouter)(req, res)

    expect(res.json.calledOnce).to.be.true
    const collectionJson = res.json.firstCall.args[0]
    expect(collectionJson.name).to.equal('Empty collection')
    expect(collectionJson.books).to.deep.equal([])
    expect(await Database.collectionModel.count()).to.equal(1)
    expect(SocketAuthority.emitter.calledWith('collection_added')).to.be.true
  })

  it('should still reject invalid books', async () => {
    const req = { user, body: { libraryId: library.id, name: 'Invalid', books: ['not-a-library-item'] } }
    const res = makeRes()
    await CollectionController.create.bind(apiRouter)(req, res)

    expect(res.status.calledWith(400)).to.be.true
    expect(await Database.collectionModel.count()).to.equal(0)
  })
})
