import { FabrixModel as Model } from '@fabrix/fabrix/dist/common'
import { SequelizeResolver } from '@fabrix/spool-sequelize'

const IMAGE_MODELS = require('../../lib').Enums.IMAGE_MODELS
const _ = require('lodash')

/**
 * @module ItemImage
 * @description Item Image n:m
 */
export class ItemImage extends Model {

  static get resolver() {
    return SequelizeResolver
  }

  static config (app, Sequelize) {
    return {
      options: {
        underscored: true,
        enums: {
          IMAGE_MODELS: IMAGE_MODELS
        },
        classMethods: {

        }
      }
    }
  }

  static schema (app, Sequelize) {
    return {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      image_id: {
        type: Sequelize.INTEGER,
        unique: 'image_model'
      },
      // Model the image belongs to
      model: {
        type: Sequelize.ENUM,
        unique: 'image_model',
        values: _.values(IMAGE_MODELS)
      },
      // ID of the model the image belongs to
      model_id: {
        type: Sequelize.INTEGER,
        unique: 'image_model',
        references: null
      },
      // The order of the image in the list of images.
      position: {
        type: Sequelize.INTEGER,
        defaultValue: 1
      }
    }
  }

  /**
   * Associate the Model
   * @param models
   */
  public static associate (models) {
    models.ItemImage.belongsTo(models.Image, {
      foreignKey: 'image_id'
    })
  }
}
