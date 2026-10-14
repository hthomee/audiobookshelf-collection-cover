/**
 * @typedef MigrationContext
 * @property {import('sequelize').QueryInterface} queryInterface - a Sequelize QueryInterface object.
 * @property {import('../Logger')} logger - a Logger object.
 *
 * @typedef MigrationOptions
 * @property {MigrationContext} context - an object containing the migration context.
 */

const migrationVersion = '2.37.1'
const migrationName = `${migrationVersion}-add-collection-cover-path`
const loggerPrefix = `[${migrationVersion} migration]`

/**
 * This migration script adds the coverPath column to the collections table.
 *
 * @param {MigrationOptions} options - an object containing the migration context.
 * @returns {Promise<void>} - A promise that resolves when the migration is complete.
 */
async function up({ context: { queryInterface, logger } }) {
  logger.info(`${loggerPrefix} UPGRADE BEGIN: ${migrationName}`)

  if (await queryInterface.tableExists('collections')) {
    const tableDescription = await queryInterface.describeTable('collections')

    if (!tableDescription.coverPath) {
      logger.info(`${loggerPrefix} Adding coverPath column to collections table`)
      await queryInterface.addColumn('collections', 'coverPath', {
        type: queryInterface.sequelize.Sequelize.DataTypes.STRING,
        allowNull: true
      })
      logger.info(`${loggerPrefix} Added coverPath column to collections table`)
    } else {
      logger.info(`${loggerPrefix} coverPath column already exists in collections table`)
    }
  } else {
    logger.info(`${loggerPrefix} collections table does not exist`)
  }

  logger.info(`${loggerPrefix} UPGRADE END: ${migrationName}`)
}

/**
 * This migration script removes the coverPath column from the collections table.
 *
 * @param {MigrationOptions} options - an object containing the migration context.
 * @returns {Promise<void>} - A promise that resolves when the migration is complete.
 */
async function down({ context: { queryInterface, logger } }) {
  logger.info(`${loggerPrefix} DOWNGRADE BEGIN: ${migrationName}`)

  if (await queryInterface.tableExists('collections')) {
    const tableDescription = await queryInterface.describeTable('collections')

    if (tableDescription.coverPath) {
      logger.info(`${loggerPrefix} Removing coverPath column from collections table`)
      await queryInterface.removeColumn('collections', 'coverPath')
      logger.info(`${loggerPrefix} Removed coverPath column from collections table`)
    } else {
      logger.info(`${loggerPrefix} coverPath column does not exist in collections table`)
    }
  } else {
    logger.info(`${loggerPrefix} collections table does not exist`)
  }

  logger.info(`${loggerPrefix} DOWNGRADE END: ${migrationName}`)
}

module.exports = { up, down }
