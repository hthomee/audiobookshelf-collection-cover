const chai = require('chai')
const sinon = require('sinon')
const { expect } = chai

const { DataTypes, Sequelize } = require('sequelize')
const Logger = require('../../../server/Logger')

const { up, down } = require('../../../server/migrations/v2.38.0-add-collection-cover-path')

describe('Migration v2.38.0-add-collection-cover-path', () => {
  let sequelize
  let queryInterface
  let loggerInfoStub

  beforeEach(async () => {
    sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
    queryInterface = sequelize.getQueryInterface()
    loggerInfoStub = sinon.stub(Logger, 'info')

    await queryInterface.createTable('collections', {
      id: { type: DataTypes.UUID, primaryKey: true },
      name: { type: DataTypes.STRING },
      description: { type: DataTypes.TEXT },
      libraryId: { type: DataTypes.UUID },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    })
    await queryInterface.bulkInsert('collections', [{ id: 'c1b1b1b1-0000-4000-8000-000000000001', name: 'Existing', createdAt: new Date(), updatedAt: new Date() }])
  })

  afterEach(() => {
    sinon.restore()
  })

  describe('up', () => {
    it('should add a nullable coverPath column and keep existing rows', async () => {
      await up({ context: { queryInterface, logger: Logger } })

      const tableDescription = await queryInterface.describeTable('collections')
      expect(tableDescription.coverPath).to.exist
      expect(tableDescription.coverPath.allowNull).to.be.true

      const [rows] = await sequelize.query('SELECT name, coverPath FROM collections')
      expect(rows).to.deep.equal([{ name: 'Existing', coverPath: null }])

      expect(loggerInfoStub.calledWith('[2.38.0 migration] UPGRADE BEGIN: 2.38.0-add-collection-cover-path')).to.be.true
      expect(loggerInfoStub.calledWith('[2.38.0 migration] Added coverPath column to collections table')).to.be.true
      expect(loggerInfoStub.calledWith('[2.38.0 migration] UPGRADE END: 2.38.0-add-collection-cover-path')).to.be.true
    })

    it('should be idempotent', async () => {
      await up({ context: { queryInterface, logger: Logger } })
      await up({ context: { queryInterface, logger: Logger } })

      const tableDescription = await queryInterface.describeTable('collections')
      expect(tableDescription.coverPath).to.exist
      expect(loggerInfoStub.calledWith('[2.38.0 migration] coverPath column already exists in collections table')).to.be.true
    })
  })

  describe('down', () => {
    it('should remove the coverPath column and keep existing rows', async () => {
      await up({ context: { queryInterface, logger: Logger } })
      await down({ context: { queryInterface, logger: Logger } })

      const tableDescription = await queryInterface.describeTable('collections')
      expect(tableDescription.coverPath).to.not.exist

      const [rows] = await sequelize.query('SELECT name FROM collections')
      expect(rows).to.deep.equal([{ name: 'Existing' }])

      expect(loggerInfoStub.calledWith('[2.38.0 migration] DOWNGRADE BEGIN: 2.38.0-add-collection-cover-path')).to.be.true
      expect(loggerInfoStub.calledWith('[2.38.0 migration] Removed coverPath column from collections table')).to.be.true
      expect(loggerInfoStub.calledWith('[2.38.0 migration] DOWNGRADE END: 2.38.0-add-collection-cover-path')).to.be.true
    })

    it('should be idempotent', async () => {
      await down({ context: { queryInterface, logger: Logger } })

      const tableDescription = await queryInterface.describeTable('collections')
      expect(tableDescription.coverPath).to.not.exist
      expect(loggerInfoStub.calledWith('[2.38.0 migration] coverPath column does not exist in collections table')).to.be.true
    })
  })
})
