import { FabrixService as Service } from '@fabrix/fabrix/dist/common'
import { ModelError } from '@fabrix/spool-sequelize/dist/errors'
import * as fs from 'fs'
import * as _ from 'lodash'
import { PRODUCT_DEFAULTS, VARIANT_DEFAULTS } from '../../enums'

/**
 * @module ProductService
 * @description Product Service
 */
export class ProductService extends Service {
  publish(type, event, options: { save?: boolean, transaction?: any, include?: any } = {}) {
    if (this.app.services.EventsService) {
      options.include = options.include || [{
        model: this.app.models.EventItem.instance,
        as: 'objects'
      }]
      return this.app.services.EventsService.publish(type, event, options)
    }
    this.app.log.debug('spool-events is not installed, please install it to use publish')
    return Promise.resolve()
  }
  /**
   *
   * @param item
   * @param options
   */
  resolveItem(item, options: { [key: string]: any } = {}) {
    const Product = this.app.models.Product
    const ProductVariant = this.app.models.ProductVariant
    const Image = this.app.models.ProductImage

    if (item.id || item.variant_id || item.product_variant_id) {
      const id = item.id || item.variant_id || item.product_variant_id
      return ProductVariant.findById(id, {
        transaction: options.transaction || null,
        include: [
          {
            model: Product.instance,
            include: [
              {
                model: Image.instance,
                as: 'images',
                attributes: ['src', 'full', 'thumbnail', 'small', 'medium', 'large', 'alt', 'position']
              }
            ]
          },
          {
            model: Image.instance,
            as: 'images',
            attributes: ['src', 'full', 'thumbnail', 'small', 'medium', 'large', 'alt', 'position']
          }
        ]
      })
    }
    else if (item.product_id) {
      return ProductVariant.findOne({
        where: {
          product_id: item.product_id,
          position: 1
        },
        transaction: options.transaction || null,
        include: [
          {
            model: Product.instance,
            include: [
              {
                model: Image.instance,
                as: 'images',
                attributes: ['src', 'full', 'thumbnail', 'small', 'medium', 'large', 'alt', 'position']
              }
            ]
          },
          {
            model: Image.instance,
            as: 'images',
            attributes: ['src', 'full', 'thumbnail', 'small', 'medium', 'large', 'alt', 'position']
          }
        ]
      })
    }
    else {
      const err = new ModelError('E_NOT_FOUND', `${item} not found`)
      return Promise.reject(err)
    }
  }
  /**
   * Add Multiple Products
   * @param items
   * @param options
   * @returns {Promise.<*>}
   */
  resolveItems(items, options: {[key: string]: any} = {}) {
    if (!Array.isArray(items)) {
      items = [items]
    }
    const Sequelize = this.app.models['Product'].sequelize
    // const addedProducts = []
    // Setup Transaction
    return Sequelize.transaction(t => {
      return Sequelize.Promise.mapSeries(items, item => {
        return this.resolveItem(item, {
          transaction: t
        })
      })
    })
  }
  /**
   * Add Multiple Products
   * @param products
   * @param options
   * @returns {Promise.<*>}
   */
  addProducts(products, options: {[key: string]: any} = {}) {
    if (!Array.isArray(products)) {
      products = [products]
    }
    const Sequelize = this.app.models['Product'].sequelize
    // const addedProducts = []
    // Setup Transaction
    return Sequelize.transaction(t => {
      return Sequelize.Promise.mapSeries(products, product => {
        return this.addProduct(product, {
          transaction: t
        })
      })
    })
  }

  /**
   * Add a Product
   * @param product
   * @param options
   * @returns {Promise}
   */
  addProduct(product, options: {[key: string]: any} = {}) {
    const Product = this.app.models.Product

    return Product.findOne({
      where: {
        host: product.host ? product.host : 'localhost',
        handle: product.handle
      },
      attributes: ['id'],
      transaction: options.transaction || null
    })
      .then(resProduct => {
        if (resProduct instanceof Product.instance) {
          // Set ID in case it's missing in this transaction
          product.id = resProduct.id
          // Update the existing product
          return this.updateProduct(product, options)
        }
        else {
          // Create a new Product
          return this.createProduct(product, options)
        }
      })
  }

  /**
   * Create A Product with default Variant
   * @param product
   * @param options
   * @returns {Promise}
   */
  // TODO Create Images and Variant Images in one command
  createProduct(product, options: {[key: string]: any} = {}) {
    const Product = this.app.models.Product
    const Tag = this.app.models.Tag
    const Variant = this.app.models.ProductVariant
    // const Image = this.app.models.ProductImage
    const Metadata = this.app.models.Metadata
    const Collection = this.app.models.Collection
    const Vendor = this.app.models.Vendor
    const Shop = this.app.models.Shop

    if (!product) {
      const err = new Error('A product is required')
      return Promise.reject(err)
    }

    product = this.productDefaults(product)
    // The Default Product
    const create: { [key: string]: any } = {
      host: product.host,
      handle: product.handle,
      title: product.title,
      seo_title: product.seo_title,
      seo_description: product.seo_description,
      body: product.body,
      type: product.type,
      price: product.price,
      compare_at_price: product.compare_at_price,
      calculated_price: product.calculated_price,
      tax_code: product.tax_code,
      published: product.published,
      available: product.available,
      published_scope: product.published_scope,
      weight: product.weight,
      weight_unit: product.weight_unit,
      average_shipping: product.average_shipping,
      property_pricing: product.property_pricing,
      exclude_payment_types: product.exclude_payment_types,
      metadata: Metadata.transform(product.metadata || {}),
      google: product.google,
      amazon: product.amazon,
      options: product.options
    }
    // create = Product.build(create)

    if (product.published === true) {
      create.published_at = new Date()
    }
    if (product.published === false) {
      create.unpublished_at = new Date()
    }
    if (product.published_scope) {
      create.published_scope = product.published_scope
    }
    if (product.seo_title) {
      create.seo_title = product.seo_title
    }
    if (!product.seo_title && product.title) {
      create.seo_title = product.title
    }
    if (product.seo_description) {
      create.seo_description = this.app.services.ProxyCartService.description(product.seo_description)
    }
    if (!product.seo_description && product.body) {
      create.seo_description = this.app.services.ProxyCartService.description(product.body)
    }
    // Images
    let images = []
    // If this request came with product images
    if (product.images.length > 0) {
      product.images = product.images.map(image => {
        image.variant = 0
        return image
      })
      images = images.concat(product.images)
      delete product.images
    }

    // Variants
    // Set a default variant based of off product
    let variants: { [key: string]: any }[] = [{
      title: product.title,
      sku: product.sku,
      vendors: product.vendors,
      google: product.google,
      amazon: product.amazon
    }]
    // Set the published status
    if (product.published === true) {
      variants[0].published_at = create.published_at
    }
    if (product.published === false) {
      variants[0].unpublished_at = create.unpublished_at
    }
    // If this is not a true variant because it is missing a sku (which is required), let's remove it.
    if (!variants[0].sku) {
      variants.splice(0, 1)
    }
    // Add variants to the default
    if (product.variants.length > 0) {
      variants = variants.concat(product.variants)
    }
    // For every variant, map missing defaults and images
    variants = variants.map((variant, index) => {
      // Set defaults from product to variant
      variant = this.variantDefaults(variant, product)
      // Map Variant Positions putting default at 1
      variant.position = index + 1
      // If this variant is not explicitly not published set to status of parent
      if (product.published && variant.published !== false) {
        variant.published = true
      }
      // If this variant is published then set published_at to same as parent
      if (variant.published) {
        variant.published_at = create.published_at
      }
      // Handle Variant Images
      if (variant.images.length > 0) {
        variant.images = variant.images.map(image => {
          image.variant = index
          return image
        })
        images = images.concat(variant.images)
        delete variant.images
      }
      if (variant.option) {
        const keys = Object.keys(variant.option)
        create.options = _.union(create.options, keys)
      }
      return variant
    })
    // Filter out undefined
    variants = variants.filter(variant => variant)

    // Assign the variants to the create model
    create.total_variants = variants.length
    create.variants = variants

    // Map image positions
    images = images.map((image, index) => {
      image.position = index + 1
      return image
    })

    // Set the resulting Product
    let resProduct
    return Product.create(create, {
      include: [
        {
          model: Variant.instance,
          as: 'variants',
          include: [
            {
              model: Metadata.instance,
              as: 'metadata'
            }
          ]
        },
        {
          model: Metadata.instance,
          as: 'metadata',
        }
      ],
      transaction: options.transaction || null
    })
      .then(createdProduct => {
        if (!createdProduct) {
          throw new Error('Product was not created')
        }
        resProduct = createdProduct
        if (product.tags && product.tags.length > 0) {
          product.tags = _.sortedUniq(product.tags.filter(n => n))
          return Tag.transformTags(product.tags, { transaction: options.transaction || null })
        }
        return
      })
      .then(tags => {
        if (tags && tags.length > 0) {
          // Add Tags
          return resProduct.setTags(tags.map(tag => tag.id), { transaction: options.transaction || null })
        }
        return
      })
      .then(productTags => {
        if (product.shops && product.shops.length > 0) {
          product.shops = _.sortedUniq(product.shops.filter(n => n))
          return Shop.transformShops(product.shops, { transaction: options.transaction || null })
        }
        return
      })
      .then(shops => {
        if (shops && shops.length > 0) {
          // return resProduct.setShops(shops, { transaction: options.transaction || null })
          //   .then(() => {
              return Product.sequelize.Promise.mapSeries(resProduct.variants, variant => {
                return variant.setShops(shops, {through: {product_id: resProduct.id}, transaction: options.transaction || null})
              })
            // })
        }
        return
      })
      .then(shops => {
        if (product.collections && product.collections.length > 0) {
          // Resolve the collections
          product.collections = _.sortedUniq(product.collections.filter(n => n))
          return Collection.transformCollections(product.collections, { transaction: options.transaction || null })
        }
        return
      })
      .then(collections => {
        if (collections && collections.length > 0) {
          return Product.sequelize.Promise.mapSeries(collections, collection => {
            const through = collection.product_position ? { position: collection.product_position } : {}
            return resProduct.addCollection(collection.id, {
              through: through,
              transaction: options.transaction || null
            })
          })
          // return resProduct.setCollections(collections.map(c => c.id), {
          //   through: {
          //     positions: collections.map(c => c.position || 0)
          //   },
          //   transaction: options.transaction || null
          // })
        }
        return
      })
      .then(productCollections => {
        if (product.vendors && product.vendors.length > 0) {
          return Vendor.transformVendors(product.vendors, { transaction: options.transaction || null })
        }
        return
      })
      .then(vendors => {
        if (vendors && vendors.length > 0) {
          // TODO add vendor_price, policies
          return resProduct.setVendors(vendors.map(v => v.id), {
            through: { vendor_price: resProduct.price },
            transaction: options.transaction || null
          })
        }
        return
      })
      .then(vendors => {
        return Product.sequelize.Promise.mapSeries(images, image => {
          // If variant index, set the variant image
          if (typeof image.variant !== 'undefined') {
            if (resProduct.variants && resProduct.variants[image.variant] && resProduct.variants[image.variant].id) {
              image.product_variant_id = resProduct.variants[image.variant].id
            }
            delete image.variant
          }
          return resProduct.createImage(image, { transaction: options.transaction || null })
        })
      })
      .then(createdImages => {
        return Product.findByIdDefault(resProduct.id, { transaction: options.transaction || null })
      })
  }
  /**
   *
   * @param products
   * @returns {Promise.<*>}
   */
  updateProducts(products) {
    if (!Array.isArray(products)) {
      products = [products]
    }
    const Product = this.app.models.Product
    return Product.datastore.transaction(t => {
      return Product.sequelize.Promise.mapSeries(products, product => {
        return this.updateProduct(product, {
          transaction: t
        })
      })
    })
  }

  /**
   *
   * @param product
   * @param options
   * @returns {Promise}
   */
  // TODO Create/Update Images and Variant Images in one command
  updateProduct(product, options) {
    options = options || {}
    const Product = this.app.models['Product']
    const Variant = this.app.models['ProductVariant']
    const Image = this.app.models['ProductImage']
    const Tag = this.app.models['Tag']
    const Collection = this.app.models['Collection']
    const Vendor = this.app.models['Vendor']
    // const Metadata = this.app.models['Metadata']

    const productOptions = []

    // if (!product.id) {
    //   throw new ModelError('E_NOT_FOUND', 'Product is missing id')
    // }

    let resProduct, update: { [key: string]: any } = {}
    return Product.resolve(product, {
      transaction: options.transaction || null
    })
      .then(_product => {
        if (!_product) {
          throw new Error('Product not found')
        }
        resProduct = _product
        return resProduct.resolveVariants({ transaction: options.transaction || null })
      })
      .then(() => {
        if (product.collections) {
          return resProduct.resolveCollections({ transaction: options.transaction || null })
        }
        return
      })
      .then(() => {
        // if (product.images) {
        return resProduct.resolveImages({ transaction: options.transaction || null })
        // }
        // return
      })
      .then(() => {
        if (product.metadata) {
          return resProduct.resolveMetadata({ transaction: options.transaction || null })
        }
        return
      })
      .then(() => {
        if (product.associations) {
          return resProduct.resolveAssociations({ transaction: options.transaction || null })
        }
        return
      })
      .then(() => {
        if (product.vendors) {
          return resProduct.resolveVendors({ transaction: options.transaction || null })
        }
        return
      })
      .then(() => {

        update = {
          host: product.host || resProduct.host,
          handle: product.handle || resProduct.handle,
          seo_title: product.seo_title || resProduct.seo_title,
          seo_description: product.seo_description || resProduct.seo_description,
          body: product.body || resProduct.body,
          type: product.type || resProduct.type,
          published_scope: product.published_scope || resProduct.published_scope,
          available: product.available,
          average_shipping: product.average_shipping,
          property_pricing: product.property_pricing,
          exclude_payment_types: product.exclude_payment_types,
          weight: product.weight || resProduct.weight,
          weight_unit: product.weight_unit || resProduct.weight_unit,
          requires_shipping: product.requires_shipping || resProduct.requires_shipping,
          tax_code: product.tax_code || resProduct.tax_code,
          options: productOptions
        }

        // force array of variants
        product.variants = product.variants || []
        // force array of images
        product.images = product.images || []
        // force array of tags
        product.tags = product.tags || []
        // force array of collections
        product.collections = product.collections || []
        // force array of associations
        product.associations = product.associations || []

        // If product is getting published
        if (product.published === true && resProduct.published === false) {
          update.published = resProduct.variants[0].published = product.published
          update.published_at = resProduct.variants[0].published_at = new Date()
        }
        // If product is getting unpublished
        if (product.published === false && resProduct.published === true) {
          update.published = resProduct.variants[0].published = product.published
          update.unpublished_at = resProduct.variants[0].unpublished_at = new Date()
        }

        // If the SKU is changing, set the default sku
        if (product.sku) {

          // let variants = [{
          //   title: product.title,
          //   sku: product.sku,
          //   vendors: product.vendors,
          //   google: product.google,
          //   amazon: product.amazon
          // }]

          resProduct.variants[0].sku = product.sku
        }
        // if The title is changing, set the default title
        if (product.title) {
          update.title = resProduct.variants[0].title = product.title
        }
        // if the price is changing
        if (product.price) {
          update.price = resProduct.variants[0].price = product.price
        }
        // if the compare_at_price is changing
        if (product.compare_at_price) {
          update.compare_at_price = resProduct.variants[0].compare_at_price = product.compare_at_price
        }
        // Update seo_title if provided, else update it if a new product title
        if (product.seo_title) {
          update.seo_title = product.seo_title // .substring(0,255)
        }
        // Update product_seo title
        if (product.title && !product.seo_title) {
          update.seo_title = product.title // .substring(0,255)
        }
        // Update seo_description if provided, else update it if a new product body
        if (product.seo_description) {
          update.seo_description = this.app.services.ProxyCartService.description(product.seo_description)
        }
        // Update seo_description
        if (!product.seo_description && product.body) {
          update.seo_description = this.app.services.ProxyCartService.description(product.body)
        }

        // Update Existing Variant
        resProduct.variants = resProduct.variants.map(variant => {
          // Find the existing variant
          const variantToUpdate = product.variants.find(v => variant.id === v.id || variant.sku === v.sku) || {}
          // Add new Images
          if (variantToUpdate && variantToUpdate.images) {
            let newImages = variantToUpdate.images.filter(image => !image.id)
            // let oldImages = variantToUpdate.images.filter(image => image.id)
            newImages = newImages.map(image => {
              image.product_id = resProduct.id
              image.product_variant_id = variant.id
              return Image.build(image)
            })
            resProduct.images = _.concat(resProduct.images, newImages)
          }
          for (const k in variantToUpdate) {
            if (variantToUpdate.hasOwnProperty(k) && variantToUpdate.hasOwnProperty(k)) {
              if (!_.isNil(variantToUpdate[k])) {
                variant[k] = variantToUpdate[k]
              }
            }
          }

          return variant
        })

        // Create a List of new Variants that will be added
        product.variants = product.variants.filter(
          variant => !variant.id && !resProduct.variants.find(v => {
            return v.id === variant.id || v.sku === variant.sku
          })
        )
        // Build the new Variants
        product.variants = product.variants.map((variant) => {
          // Set the product id of the variant
          variant.product_id = resProduct.id
          // Set the defaults
          variant = this.variantDefaults(variant, resProduct.get({ plain: true }))

          if (variant.images.length > 0) {
            // Update the master image if new/updated attributes are defined
            resProduct.images = resProduct.images.map(image => {
              return _.extend(image, variant.images.find(i => i.id === image.id || i.src === image.src))
            })

            // Create a list of new variant images
            variant.images = variant.images.filter(image => !image.id)
            // build the new images
            variant.images = variant.images.map(image => {
              // image.variant = index
              image.product_id = resProduct.id
              return Image.build(image)
            })

            // Add these variant images to the new array.
            resProduct.images = _.concat(resProduct.images, variant.images)
            // delete variant.images
          }
          return Variant.build(variant)
        })
        // Join all the variants and sort by current positions
        resProduct.variants = _.sortBy(_.concat(resProduct.variants, product.variants), 'position')

        // Set the new Positions
        resProduct.variants = resProduct.variants.map((variant, index) => {
          variant.position = index + 1
          return variant
        })
        // Calculate new total of variants
        resProduct.total_variants = resProduct.variants.length

        // Set the new product options
        resProduct.variants.forEach(variant => {
          if (variant.option) {
            const keys = Object.keys(variant.option)
            // resProduct.options = _.union(resProduct.options, keys)
            update.options = _.union(update.options, keys)
          }
        })

        // Update existing Images
        resProduct.images = resProduct.images.map(image => {
          const imageToUpdate = product.images.find(i => i.id === image.id || i.src === image.src) || {}

          for (const k in imageToUpdate) {
            if (imageToUpdate.hasOwnProperty(k) && imageToUpdate.hasOwnProperty(k)) {
              if (!_.isNil(imageToUpdate[k])) {
                image[k] = imageToUpdate[k]
              }
            }
          }

          return image
        })

        // Create a List of new Images
        product.images = product.images.filter(
          image => !image.id && !resProduct.images.find(i => {
            return i.id === image.id || i.src === image.src
          })
        )

        // Map the new images with their product id
        product.images = product.images.map(image => {
          image.product_id = resProduct.id
          return Image.build(image)
        })
        // Join all the images
        resProduct.images = _.sortBy(_.concat(resProduct.images, product.images), 'position')
        // Set the Positions
        resProduct.images = resProduct.images.map((image, index) => {
          image.position = index + 1
          return image
        })

        // Update changed attributes
        return resProduct.updateAttributes(update, { transaction: options.transaction || null })
      })
      .then(updateProduct => {
        // Transform any new Tags
        if (product.tags && product.tags.length > 0) {
          product.tags = _.sortedUniq(product.tags.filter(n => n))
          return Tag.transformTags(product.tags, { transaction: options.transaction || null })
        }
        return
      })
      .then(tags => {
        // Set Tags
        if (tags && tags.length > 0) {
          return resProduct.setTags(tags.map(t => t.id), { transaction: options.transaction || null })
        }
        return
      })
      .then(productTags => {
        if (product.collections && product.collections.length > 0) {
          // Resolve the collections
          product.collections = _.sortedUniq(product.collections.filter(n => n))
          return Collection.transformCollections(product.collections, { transaction: options.transaction || null })
        }
        return
      })
      .then(collections => {
        // Set the collections
        if (collections && collections.length > 0) {
          return Product.sequelize.Promise.mapSeries(collections, collection => {
            const through = collection.product_position ? { position: collection.product_position } : {}
            return resProduct.addCollection(collection.id, {
              through: through,
              hooks: false,
              individualHooks: false,
              returning: false,
              transaction: options.transaction || null
            })
          })
          // return resProduct.setCollections(collections.map(c => c.id), {transaction: options.transaction || null})
        }
        return
      })
      .then(() => {
        // if product metadata.
        if (product.metadata && _.isObject(product.metadata)) {
          resProduct.metadata.data = product.metadata || {}
          // save the metadata
          return resProduct.metadata.save({ transaction: options.transaction || null })
        }
        return
      })
      .then(metadata => {
        if (product.vendors && product.vendors.length > 0) {
          return Vendor.transformVendors(product.vendors, { transaction: options.transaction || null })
        }
        return
      })
      .then(vendors => {
        if (vendors && vendors.length > 0) {
          return resProduct.setVendors(vendors.map(v => v.id), { transaction: options.transaction || null })
        }
        return
      })
      .then(vendors => {
        return Product.sequelize.Promise.mapSeries(resProduct.variants, variant => {
          if (variant instanceof Variant.instance) {
            return variant.save({
              transaction: options.transaction || null
            })
              .catch(err => {
                this.app.log.error(err)
                return variant
              })
          }
          else {
            return resProduct.createVariant(variant, {
              transaction: options.transaction || null
            })
          }
        })
      })
      .then(variants => {
        return Product.sequelize.Promise.mapSeries(resProduct.images, image => {
          if (typeof image.variant !== 'undefined') {
            image.product_variant_id = resProduct.variants[image.variant].id
            delete image.variant
          }
          if (image instanceof Image.instance) {
            return image.save({ transaction: options.transaction || null })
          }
          else {
            return resProduct.createImage(image, {
              transaction: options.transaction || null
            })
          }
        })
      })
      .then(images => {
        return Product.findByIdDefault(resProduct.id, {
          transaction: options.transaction || null
        })
      })
  }
  /**
   *
   * @param products
   * @returns {Promise.<*>}
   */
  removeProducts(products) {
    if (!Array.isArray(products)) {
      products = [products]
    }
    const Product = this.app.models['Product']
    return Product.sequelize.Promise.mapSeries(products, product => {
      return this.removeProduct(product)
    })
  }

  /**
   *
   * @param product
   * @param options
   */
  removeProduct(product, options: { [key: string]: any } = {}) {
    if (!product.id) {
      const err = new ModelError('E_NOT_FOUND', 'Product is missing id')
      return Promise.reject(err)
    }
    const Product = this.app.models.Product
    return Product.destroy({
      where: {
        id: product.id
      },
      transaction: options.transaction || null
    })
  }

  /**
   *
   * @param variants
   */
  removeVariants(variants) {
    if (!Array.isArray(variants)) {
      variants = [variants]
    }
    const Product = this.app.models['Product']
    return Product.sequelize.Promise.mapSeries(variants, variant => {
      return this.removeVariant(variant)
    })
  }

  /**
   *
   * @param product
   * @param variant
   * @param options
   */
  // TODO upload images
  createVariant(product, variant, options: { [key: string]: any } = {}) {
    const Product = this.app.models['Product']
    const Variant = this.app.models['ProductVariant']
    let resProduct, resVariant, productOptions = []

    return Product.resolve(product, { transaction: options.transaction || null })
      .then(_product => {
        if (!_product) {
          throw new ModelError('E_NOT_FOUND', 'Could not find Product')
        }
        resProduct = _product

        variant.product_id = resProduct.id
        variant = this.variantDefaults(variant, resProduct)

        return resProduct.createVariant(variant, { transaction: options.transaction || null })
        // return this.resolveVariant(variant, options)
      })
      .then(_variant => {
        resVariant = _variant

        return Variant.findAll({
          where: {
            product_id: resProduct.id
          },
          transaction: options.transaction || null
        })
      })
      .then(variants => {
        const updates = _.sortBy(variants, 'position')
        _.map(updates, (_variant, index) => {
          _variant.position = index + 1
        })
        _.map(updates, _variant => {
          const keys = Object.keys(_variant.option)
          productOptions = _.union(productOptions, keys)
        })
        return Product.sequelize.Promise.mapSeries(updates, _variant => {
          return _variant.save({
            transaction: options.transaction || null
          })
        })
      })
      .then(updatedVariants => {
        resProduct.options = productOptions
        resProduct.total_variants = updatedVariants.length
        return resProduct.save({ transaction: options.transaction || null })
      })
      .then(updatedProduct => {
        return Variant.findByIdDefault(resVariant.id, { transaction: options.transaction || null })
      })
  }

  /**
   *
   * @param product
   * @param variants
   * @param options
   * @returns {Promise.<*>}
   */
  createVariants(product, variants, options) {
    const Product = this.app.models['Product']
    return Product.sequelize.Promise.mapSeries(variants, variant => {
      return this.createVariant(product, variant, options)
    })
  }

  /**
   *
   * @param product
   * @param variant
   * @param options
   */
  // TODO upload images
  updateVariant(product, variant, options) {
    options = options || {}
    const Product = this.app.models['Product']
    const Variant = this.app.models['ProductVariant']
    const Image = this.app.models['ProductImage']
    let resProduct, resVariant, productOptions = []
    return Product.resolve(product, { transaction: options.transaction || null })
      .then(_product => {
        if (!_product) {
          throw new Error('Product did not resolve')
        }
        resProduct = _product
        return Variant.resolve(variant, options)
      })
      .then(foundVariant => {
        resVariant = foundVariant
        resVariant = _.extend(resVariant, _.omit(variant, ['id', 'sku']))
        resVariant = this.variantDefaults(resVariant, resProduct)
        return resVariant.resolveImages({ transaction: options.transaction || null })
      }).then(() => {
        return resVariant.save({ transaction: options.transaction || null })
      })
      .then(_variant => {
        return Variant.findAll({
          where: {
            product_id: resProduct.id
          },
          transaction: options.transaction || null
        })
      })
      .then(variants => {
        const updates = _.sortBy(variants, 'position')
        _.map(updates, (_variant, index) => {
          _variant.position = index + 1
        })
        _.map(updates, _variant => {
          const keys = Object.keys(_variant.option)
          productOptions = _.union(productOptions, keys)
        })
        return Product.sequelize.Promise.mapSeries(updates, _variant => {
          return _variant.save({ transaction: options.transaction || null })
        })
      })
      .then(updatedVariants => {
        resProduct.options = product.options
        return resProduct.save({ transaction: options.transaction || null })
      })
      .then(updatedProduct => {
        return Variant.findByIdDefault(resVariant.id, { transaction: options.transaction || null })
      })

  }

  /**
   *
   */
  updateVariants(product, variants, options) {
    const Product = this.app.models['Product']
    return Product.sequelize.Promise.mapSeries(variants, variant => {
      return this.updateVariant(product, variant, options)
    })
  }
  /**
   *
   * @param id
   * @param options
   */
  removeVariant(id, options: { [key: string]: any } = {}) {
    const Product = this.app.models['Product']
    const Variant = this.app.models.ProductVariant
    let resVariant, resProduct
    let updates
    let productOptions = []
    return Variant.resolve(id, { transaction: options.transaction || null })
      .then(foundVariant => {
        resVariant = foundVariant
        return Product.resolve(resVariant.product_id, { transaction: options.transaction || null })
      })
      .then(product => {
        resProduct = product
        return Variant.findAll({
          where: {
            product_id: resVariant.product_id
          },
          transaction: options.transaction || null
        })
      })
      .then(foundVariants => {
        updates = _.sortBy(_.filter(foundVariants, variant => {
          if (variant.id !== resVariant.id) {
            return variant
          }
        }), 'position')
        _.map(updates, (variant, index) => {
          variant.position = index + 1
        })
        _.map(updates, variant => {
          const keys = Object.keys(variant.option)
          productOptions = _.union(productOptions, keys)
        })
        return Variant.sequelize.Promise.mapSeries(updates, variant => {
          return variant.save({ transaction: options.transaction || null })
        })
      })
      .then(updatedVariants => {
        resProduct.options = productOptions
        resProduct.total_variants = updatedVariants.length
        return resProduct.save({ transaction: options.transaction || null })
      })
      .then(updatedProduct => {
        return resVariant.destroy({ transaction: options.transaction || null })
      })
      .then(destroyed => {
        return resVariant
      })
  }

  /**
   *
   * @param images
   */
  removeImages(images) {
    if (!Array.isArray(images)) {
      images = [images]
    }
    const Product = this.app.models['Product']
    return Product.sequelize.Promise.mapSeries(images, image => {
      const id = typeof image.id !== 'undefined' ? image.id : image
      return this.removeImage(id)
    })
  }

  /**
   *
   * @param id
   * @param options
   */
  removeImage(id, options: { [key: string]: any } = {}) {
    const Image = this.app.models['ProductImage']
    const Product = this.app.models['Product']
    const Variant = this.app.models['ProductVariant']

    let resDestroy
    return Image.findById(id, {
      transaction: options.transaction || null
    })
      .then(_image => {
        if (!_image) {
          // TODO proper error
          throw new Error('Image not found')
        }
        resDestroy = _image

        return Image.findAll({
          where: {
            product_id: resDestroy.product_id
          },
          order: [['position', 'ASC']],
          transaction: options.transaction || null
        })
      })
      .then(foundImages => {
        foundImages = foundImages.filter(image => image.id !== id)
        foundImages = foundImages.map((image, index) => {
          image.position = index + 1
          return image
        })
        return Image.sequelize.Promise.mapSeries(foundImages, image => {
          return image.save({
            transaction: options.transaction || null
          })
        })
      })
      .then(updatedImages => {
        return resDestroy.destroy({
          transaction: options.transaction || null
        })
      })
      .then(() => {
        return resDestroy
      })
      // Deprecated in 1.5.19
      // https://github.com/fabrix-app/spool-cart/issues/58
      // .then(() => {
      //   if (options.variant) {
      //     return Variant.findByIdDefault(resDestroy.product_variant_id, { transaction: options.transaction || null })
      //   }
      //   return Product.findByIdDefault(resDestroy.product_id, { transaction: options.transaction || null })
      // })
  }

  /**
   * @param product
   * @param variant
   * @param image
   * @param options
   */
  // TODO
  addImage(product, variant, image, options: { [key: string]: any } = {}) {
    const Image = this.app.models['ProductImage']
    const Product = this.app.models['Product']
    const Variant = this.app.models['ProductVariant']

    let resProduct, resImage, resVariant
    return Product.resolve(product, { transaction: options.transaction || null })
      .then(foundProduct => {
        if (!foundProduct) {
          throw new Error('Product could not be resolved')
        }
        resProduct = foundProduct

        if (variant) {
          return Variant.resolve(variant, { transaction: options.transaction || null })
        }
        else {
          return null
        }
      })
      .then(_variant => {
        resVariant = _variant ? _variant.id : null

        return resProduct.createImage({
          product_variant_id: resVariant,
          src: image,
          position: options.position || null,
          alt: options.alt || null
        }, {
            transaction: options.transaction
          })
      })
      .then(createdImage => {
        if (!createdImage) {
          throw new Error('Image Could not be created')
        }
        resImage = createdImage
        return Image.findAll({
          where: {
            product_id: resProduct.id
          },
          order: [['position', 'ASC']],
          transaction: options.transaction || null
        })
      })
      .then(_images => {
        _images = _images.map((_image, index) => {
          _image.position = index + 1
          return _image
        })
        return Image.sequelize.Promise.mapSeries(_images, _image => {
          return _image.save({
            transaction: options.transaction || null
          })
        })
      })
      .then(updatedImages => {
        return resImage.reload()
      })
  }

  /**
   *
   * @param images
   */
  updateImages(images, options: {[key: string]: any} = {}) {
    if (!Array.isArray(images)) {
      images = [images]
    }
    const Product = this.app.models['Product']
    return Product.sequelize.Promise.mapSeries(images, image => {
      return this.updateImage(image, image, options)
    })
  }

  /**
   *
   * @param image
   * @param body
   * @param options
   */
  updateImage(image, body, options: { [key: string]: any } = {}) {
    const Image = this.app.models['ProductImage']
    const Product = this.app.models['Product']
    const Variant = this.app.models['ProductVariant']

    let resUpdate
    return Image.resolve(image, {
      transaction: options.transaction || null
    })
      .then(_image => {
        if (!_image) {
          // TODO proper error
          throw new Error('Image not found')
        }
        resUpdate = _image

        return Image.findAll({
          where: {
            product_id: resUpdate.product_id
          },
          order: [['position', 'ASC']],
          transaction: options.transaction || null
        })
      })
      // .then(_images => {
      //   _images = _images.filter(image => image.id !== id)
      //   _images = _images.map((image, index) => {
      //     image.position = index + 1
      //     return image
      //   })
      //   return Image.sequelize.Promise.mapSeries(_images, image => {
      //     return image.save({
      //       transaction: options.transaction || null
      //     })
      //   })
      // })
      .then(updatedImages => {
        return resUpdate.update(body, {
          transaction: options.transaction || null
        })
      })
      .then(() => {
        return resUpdate
      })
  }

  createImage(product, variant, filePath, options: { [key: string]: any } = {}) {
    const image = fs.readFileSync(filePath)
    const Image = this.app.models['ProductImage']
    const Product = this.app.models['Product']
    const Variant = this.app.models['ProductVariant']
    let resProduct, resImage, resVariant
    return Product.resolve(product, { transaction: options.transaction || null })
      .then(_product => {
        if (!_product) {
          throw new Error('Product could not be resolved')
        }
        resProduct = _product
        if (variant) {
          return Variant.resolve(variant, { transaction: options.transaction || null })
        }
        else {
          return null
        }
      })
      .then(_variant => {
        resVariant = _variant ? _variant.id : null
        return this.app.services.ProxyCartService.uploadImage(image, filePath)
      })
      .then(uploadedImage => {
        return resProduct.createImage({
          product_variant_id: resVariant,
          src: uploadedImage.url,
          position: options.position || null,
          alt: options.alt || null
        }, {
            transaction: options.transaction
          })
      })
      .then(createdImage => {
        if (!createdImage) {
          throw new Error('Image Could not be created')
        }
        resImage = createdImage
        return Image.findAll({
          where: {
            product_id: resProduct.id
          },
          order: [['position', 'ASC']],
          transaction: options.transaction || null
        })
      })
      .then(foundImages => {
        foundImages = foundImages.map((_image, index) => {
          _image.position = index + 1
          return _image
        })
        return Image.sequelize.Promise.mapSeries(foundImages, _image => {
          return _image.save({
            transaction: options.transaction || null
          })
        })
      })
      .then(updatedImages => {
        return resImage.reload()
      })
  }
  /**
   *
   * @param product
   * @param tag
   * @param options
   * @returns {Promise.<T>}
   */
  addTag(product, tag, options) {
    options = options || {}
    const Product = this.app.models['Product']
    const Tag = this.app.models['Tag']
    let resProduct, resTag
    return Product.resolve(product, { transaction: options.transaction || null })
      .then(_product => {
        if (!_product) {
          throw new ModelError('E_NOT_FOUND', 'Product not found')
        }
        resProduct = _product
        return Tag.resolve(tag, { transaction: options.transaction || null })
      })
      .then(_tag => {
        if (!_tag) {
          throw new ModelError('E_NOT_FOUND', 'Tag not found')
        }
        resTag = _tag
        return resProduct.hasTag(resTag.id, { transaction: options.transaction || null })
      })
      .then(hasTag => {
        if (!hasTag) {
          return resProduct.addTag(resTag.id, { transaction: options.transaction || null })
        }
        return resProduct
      })
      .then(_tag => {
        return Product.findByIdDefault(resProduct.id, { transaction: options.transaction || null })
      })
  }

  /**
   *
   * @param product
   * @param tag
   * @param options
   * @returns {Promise.<T>}
   */
  removeTag(product, tag, options) {
    options = options || {}
    const Product = this.app.models['Product']
    const Tag = this.app.models['Tag']
    let resProduct, resTag
    return Product.resolve(product, { transaction: options.transaction || null })
      .then(_product => {
        if (!_product) {
          throw new ModelError('E_NOT_FOUND', 'Product not found')
        }
        resProduct = _product
        return Tag.resolve(tag, { transaction: options.transaction || null })
      })
      .then(_tag => {
        if (!_tag) {
          throw new ModelError('E_NOT_FOUND', 'Tag not found')
        }
        resTag = _tag
        return resProduct.hasTag(resTag.id, { transaction: options.transaction || null })
      })
      .then(hasTag => {
        if (hasTag) {
          return resProduct.removeTag(resTag.id, { transaction: options.transaction || null })
        }
        return false
      })
      .then(newTag => {
        return Product.findByIdDefault(resProduct.id, { transaction: options.transaction || null })
      })
  }

  addAssociations(product, associations = [], options: { [key: string]: any } = {}) {
    const Product = this.app.models['Product']
    let resProduct
    return Product.resolve(product, options)
      .then(_product => {
        resProduct = _product
        return Product.sequelize.Promise.mapSeries(associations, a => {
          return this.addAssociation(resProduct, a, options)
        })
      })
  }

  addVariantAssociations(product, variant, associations = [], options: { [key: string]: any } = {}) {
    const ProductVariant = this.app.models['ProductVariant']
    let resVariant
    return ProductVariant.resolve(variant, options)
      .then(_variant => {
        resVariant = _variant
        return ProductVariant.sequelize.Promise.mapSeries(associations, a => {
          return this.addVariantAssociation(resVariant, a, options)
        })
      })
  }

  /**
   *
   * @param product
   * @param association
   * @param options
   * @returns {Promise.<T>}
   */
  addAssociation(product, association, options: { [key: string]: any } = {}) {

    const Product = this.app.models['Product']
    const ProductVariant = this.app.models['ProductVariant']
    let resProduct, resVariant, resAssociationProduct, resAssociationVariant, through

    if (!product || !association) {
      throw new ModelError('E_NOT_FOUND', 'Product or Association was not provided')
    }

    return Product.resolve(product, { transaction: options.transaction || null })
      .then(_product => {
        if (!_product) {
          throw new ModelError('E_NOT_FOUND', 'Product not found')
        }
        resProduct = _product
        // If this product object also provided a sku
        if (product.sku) {
          return ProductVariant.resolve(product, { transaction: options.transaction || null })
        }
        // Return the default Variant
        else {
          return resProduct.getDefaultVariant({ transaction: options.transaction || null })
        }
      })
      .then(_variant => {
        if (_variant) {
          resVariant = _variant
        }
        return Product.resolve(association, { transaction: options.transaction || null })
      })
      .then(_association => {
        if (!_association) {
          throw new ModelError('E_NOT_FOUND', 'Product not found')
        }
        resAssociationProduct = _association
        // If this product object also provided a sku
        if (association.sku) {
          return ProductVariant.resolve(association)
        }
        // Return the default Variant
        else {
          return resAssociationProduct.getDefaultVariant({ transaction: options.transaction || null })
        }
      })
      .then(_variantAssociation => {
        if (_variantAssociation) {
          resAssociationVariant = _variantAssociation
        }

        through = resVariant && resAssociationVariant ? {
          variant_id: resVariant.id,
          associated_variant_id: resAssociationVariant.id,
          // position:
        } : {}

        if (association.position !== 'undefined') {
          through.position = association.position
        }

        // Check if the association exists
        return resProduct.hasAssociation(resAssociationProduct.id, {
          transaction: options.transaction || null,
          through: through
        })
      })
      .then(hasAssociation => {
        if (!hasAssociation) {
          return resProduct.addAssociation(resAssociationProduct.id, {
            transaction: options.transaction || null,
            through: through
          })
            .then(() => {
              return resProduct.save({ transaction: options.transaction || null })
            })
        }
        return false
      })
      .then(_newAssociation => {
        return resAssociationProduct
      })
      // .then(_newAssociation => {
      //   return Product.findByIdDefault(resProduct.id, { transaction: options.transaction || null })
      // })
  }

  /**
   *
   * @param product
   * @param association
   * @param options
   * @returns {Promise.<T>}
   */
  removeAssociation(product, association, options: { [key: string]: any } = {}) {
    const Product = this.app.models['Product']
    const ProductVariant = this.app.models['ProductVariant']
    let resProduct, resVariant, resAssociationProduct, resAssociationVariant, through

    if (!product || !association) {
      throw new ModelError('E_NOT_FOUND', 'Product or Association was not provided')
    }

    return Product.resolve(product, { transaction: options.transaction || null })
      .then(_product => {
        if (!_product) {
          throw new ModelError('E_NOT_FOUND', 'Product not found')
        }
        resProduct = _product
        // If this product object also provided a sku
        if (product.sku) {
          return ProductVariant.resolve(product)
        }
        return
      })
      .then(_variant => {
        if (_variant) {
          resVariant = _variant
        }
        return Product.resolve(association, { transaction: options.transaction || null })
      })
      .then(_association => {
        if (!_association) {
          throw new ModelError('E_NOT_FOUND', 'Product not found')
        }
        resAssociationProduct = _association
        // If this association is an object and also provided a sku
        if (association.sku) {
          return ProductVariant.resolve(association)
        }
        return
      })
      .then(_variantAssociation => {
        if (_variantAssociation) {
          resAssociationVariant = _variantAssociation
        }

        // If this request was for variants
        through = resVariant && resAssociationVariant ? {
          variant_id: resVariant.id,
          associated_variant_id: resAssociationVariant.id,
        } : {}

        // Check if the association exists
        return resProduct.hasAssociation(resAssociationProduct.id, {
          transaction: options.transaction || null,
          through: through
        })
      })
      .then(hasAssociation => {
        if (hasAssociation) {
          return resProduct.removeAssociation(resAssociationProduct.id, {
            transaction: options.transaction || null,
            through: through
          })
        }
        return false
      })
      .then(_newAssociation => {
        return Product.findByIdDefault(resProduct.id, { transaction: options.transaction || null })
      })
  }


  /**
   *
   * @param productVariant
   * @param association
   * @param options
   * @returns {Promise.<T>}
   */
  // TODO refactor
  addVariantAssociation(productVariant, association, options: { [key: string]: any } = {}) {
    const ProductVariant = this.app.models['ProductVariant']
    let resProductVariant, resAssociation

    if (!productVariant || !association) {
      throw new ModelError('E_NOT_FOUND', 'Variant or Association was not provided')
    }

    return ProductVariant.resolve(productVariant, { transaction: options.transaction || null })
      .then(_productVariant => {
        if (!_productVariant) {
          throw new ModelError('E_NOT_FOUND', 'ProductVariant not found')
        }
        resProductVariant = _productVariant
        const id = association.variant_id
          ? association.variant_id : association.product_variant_id
          ? association.product_variant_id : association.id
          ? association.id : association

        if (!id) {
          throw new ModelError('E_BAD_REQUEST', `Association id (${id}) could not be reconciled`)
        }
        return ProductVariant.resolve(id, { transaction: options.transaction || null })
      })
      .then(_association => {
        if (!_association) {
          throw new ModelError('E_NOT_FOUND', 'ProductVariant not found')
        }
        resAssociation = _association
        return resProductVariant.hasAssociation(resAssociation.id, {
          transaction: options.transaction || null,
          through: {
            product_id: resProductVariant.product_id,
            associated_product_id: resAssociation.product_id
          }
        })
      })
      .then(hasAssociation => {
        if (!hasAssociation) {
          return resProductVariant.addAssociation(resAssociation.id, {
            transaction: options.transaction || null,
            through: {
              product_id: resProductVariant.product_id,
              associated_product_id: resAssociation.product_id
            }
          })
            .then(() => {
              return resProductVariant.save({ transaction: options.transaction || null })
            })
        }
        return false
      })
      .then(newAssociation => {
        return ProductVariant.findByIdDefault(resProductVariant.id, { transaction: options.transaction || null })
      })
  }

  /**
   *
   * @param productVariant
   * @param association
   * @param options
   * @returns {Promise.<T>}
   */
  removeVariantAssociation(productVariant, association, options: { [key: string]: any } = {}) {
    const ProductVariant = this.app.models['ProductVariant']
    let resProductVariant, resAssociation

    if (!productVariant || !association) {
      throw new ModelError('E_NOT_FOUND', 'Variant or Association was not provided')
    }

    return ProductVariant.resolve(productVariant, { transaction: options.transaction || null })
      .then(_productVariant => {
        if (!_productVariant) {
          throw new ModelError('E_NOT_FOUND', 'ProductVariant not found')
        }
        resProductVariant = _productVariant
        return ProductVariant.resolve(association, { transaction: options.transaction || null })
      })
      .then(_association => {
        if (!_association) {
          throw new ModelError('E_NOT_FOUND', 'ProductVariant not found')
        }
        resAssociation = _association
        return resProductVariant.hasAssociation(resAssociation.id, {
          transaction: options.transaction || null,
          through: {
            product_id: resProductVariant.product_id,
            associated_product_id: resAssociation.product_id
          }
        })
      })
      .then(hasAssociation => {
        if (hasAssociation) {
          return resProductVariant.removeAssociation(resAssociation.id, {
            transaction: options.transaction || null,
            through: {
              product_id: resProductVariant.product_id,
              associated_product_id: resAssociation.product_id
            }
          })
        }
        return false
      })
      .then(removedAssociation => {
        return ProductVariant.findByIdDefault(resProductVariant.id, { transaction: options.transaction || null })
      })
  }

  /**
   * Add Multiple collections
   * @param product
   * @param collections
   * @param options
   * @returns {Promise.<*>}
   */
  addCollections(product, collections, options: { [key: string]: any } = {}) {
    if (!Array.isArray(collections)) {
      collections = [collections]
    }
    const Sequelize = this.app.models['Product'].sequelize
    // const addedCollections = []
    // Setup Transaction
    return Sequelize.transaction(t => {
      return Sequelize.Promise.mapSeries(collections, collection => {
        return this.addCollection(product, collection, {
          transaction: t
        })
      })
    })
  }

  /**
   *
   * @param product
   * @param collection
   * @param options
   * @returns {Promise.<TResult>}
   */
  addCollection(product, collection, options: { [key: string]: any } = {}) {
    const Product = this.app.models['Product']
    const Collection = this.app.models['Collection']
    let resProduct, resCollection
    return Product.resolve(product, { transaction: options.transaction || null })
      .then(_product => {
        if (!_product) {
          throw new ModelError('E_NOT_FOUND', 'Product not found')
        }
        resProduct = _product
        return Collection.resolveOrCreate(collection, {
          transaction: options.transaction || null,
          reject: true
        })
      })
      .then(([_collection, _created]) => {
        if (!_collection) {
          throw new ModelError('E_NOT_FOUND', 'Collection not found')
        }
        resCollection = _collection
        //   return resProduct.hasCollection(resCollection.id, {transaction: options.transaction || null})
        // })
        // .then(hasCollection => {
        const through = collection.product_position ? { position: collection.product_position } : {}
        //   if (!hasCollection) {

        return resProduct.addCollection(resCollection.id, {
          through: through,
          hooks: false,
          individualHooks: false,
          returning: false,
          transaction: options.transaction || null
        })
        // }
        // return
      })
      .then(_collection => {
        return resCollection
        // return Product.findByIdDefault(resProduct.id, {transaction: options.transaction || null})
      })
  }

  /**
   *
   * @param product
   * @param collection
   * @param options
   * @returns {Promise.<T>}
   */
  removeCollection(product, collection, options: { [key: string]: any } = {}) {
    const Product = this.app.models['Product']
    const Collection = this.app.models['Collection']
    let resProduct, resCollection
    return Product.resolve(product, { transaction: options.transaction || null })
      .then(_product => {
        if (!_product) {
          throw new ModelError('E_NOT_FOUND', 'Product not found')
        }
        resProduct = _product
        return Collection.resolve(collection, {
          transaction: options.transaction || null,
          reject: true
        })
      })
      .then(_collection => {
        if (!_collection) {
          throw new ModelError('E_NOT_FOUND', 'Product not found')
        }
        resCollection = _collection
        return resProduct.hasCollection(resCollection.id, { transaction: options.transaction || null })
      })
      .then(hasCollection => {
        if (hasCollection) {
          return resProduct.removeCollection(resCollection.id, { transaction: options.transaction || null })
        }
        return resProduct
      })
      .then(_collection => {
        return resCollection
        // return Product.findByIdDefault(resProduct.id, {transaction: options.transaction || null})
      })
  }

  /**
   *
   * @param product
   * @param shop
   * @param options
   * @returns {Promise.<TResult>}
   */
  addShop(product, shop, options: { [key: string]: any } = {}) {
    const Product = this.app.models['Product']
    let resProduct, resShop
    return Product.resolve(product, { transaction: options.transaction || null })
      .then(_product => {
        if (!_product) {
          throw new ModelError('E_NOT_FOUND', 'Product not found')
        }
        resProduct = _product
        return this.app.models['Shop'].resolve(shop, { transaction: options.transaction || null })
      })
      .then(_shop => {
        if (!_shop) {
          throw new ModelError('E_NOT_FOUND', 'Product not found')
        }
        resShop = _shop
        return resProduct.hasShop(resShop.id, { transaction: options.transaction || null })
      })
      .then(hasShop => {
        if (!hasShop) {
          return resProduct.addShop(resShop.id, { transaction: options.transaction || null })
        }
        return resProduct
      })
      .then(_shop => {
        return resShop
        // return Product.findByIdDefault(resProduct.id, {transaction: options.transaction || null})
      })
  }

  /**
   *
   * @param product
   * @param shop
   * @param options
   * @returns {Promise.<TResult>}
   */
  removeShop(product, shop, options: { [key: string]: any } = {}) {
    const Product = this.app.models['Product']
    let resProduct, resShop
    return Product.resolve(product, { transaction: options.transaction || null })
      .then(_product => {
        if (!_product) {
          throw new ModelError('E_NOT_FOUND', 'Product not found')
        }
        resProduct = _product
        return this.app.models['Shop'].resolve(shop, { transaction: options.transaction || null })
      })
      .then(_shop => {
        if (!_shop) {
          throw new ModelError('E_NOT_FOUND', 'Product not found')
        }
        resShop = _shop
        return resProduct.hasShop(resShop.id, { transaction: options.transaction || null })
      })
      .then(hasShop => {
        if (hasShop) {
          return resProduct.removeShop(resShop.id, { transaction: options.transaction || null })
        }
        return resProduct
      })
      .then(_shop => {
        return resShop
        // return Product.findByIdDefault(resProduct.id, {transaction: options.transaction || null})
      })
  }

  /**
   *
   * @param product
   * @param vendor
   * @param options
   * @returns {Promise.<T>}
   */
  addVendor(product, vendor, options: { [key: string]: any } = {}) {
    const Product = this.app.models['Product']
    const Vendor = this.app.models['Vendor']
    let resProduct, resVendor
    return Product.resolve(product, { transaction: options.transaction || null })
      .then(_product => {
        if (!_product) {
          throw new ModelError('E_NOT_FOUND', 'Product not found')
        }
        resProduct = _product
        return Vendor.resolve(vendor, { transaction: options.transaction || null })
      })
      .then(_vendor => {
        if (!_vendor) {
          throw new ModelError('E_NOT_FOUND', 'Product not found')
        }
        resVendor = _vendor
        return resProduct.hasVendor(resVendor.id, { transaction: options.transaction || null })
      })
      .then(hasVendor => {
        if (!hasVendor) {
          return resProduct.addVendor(resVendor.id, { transaction: options.transaction || null })
        }
        return resProduct
      })
      .then(_vendor => {
        return resVendor
        // return Product.findByIdDefault(resProduct.id, {transaction: options.transaction || null})
      })
  }

  /**
   *
   * @param product
   * @param vendor
   * @param options
   * @returns {Promise.<TResult>}
   */
  removeVendor(product, vendor, options: { [key: string]: any } = {}) {
    const Product = this.app.models['Product']
    const Vendor = this.app.models['Vendor']
    let resProduct, resVendor
    return Product.resolve(product, { transaction: options.transaction || null })
      .then(_product => {
        if (!_product) {
          throw new ModelError('E_NOT_FOUND', 'Product not found')
        }
        resProduct = _product
        return Vendor.resolve(vendor, { transaction: options.transaction || null })
      })
      .then(_vendor => {
        if (!_vendor) {
          throw new ModelError('E_NOT_FOUND', 'Product not found')
        }
        resVendor = _vendor
        return resProduct.hasVendor(resVendor.id, { transaction: options.transaction || null })
      })
      .then(hasVendor => {
        if (hasVendor) {
          return resProduct.removeVendor(resVendor.id, { transaction: options.transaction || null })
        }
        return resProduct
      })
      .then(_vendor => {
        return resVendor
        // return Product.findByIdDefault(resProduct.id, {transaction: options.transaction || null})
      })
  }


  /**
   * Sales Analytics for a given Product
   * @param product
   * @param options
   * @returns {Promise.<TResult>}
   */
  analytics(product, options: {[key: string]: any} = {}) {
    const Product = this.app.models['Product']
    const OrderItem = this.app.models['OrderItem']
    let resProduct
    return Product.resolve(product)
      .then(_product => {
        if (!_product) {
          throw new ModelError('E_NOT_FOUND', 'Product not found')
        }
        resProduct = _product

        return OrderItem.findAll({
          where: {
            product_id: resProduct.id
          },
          attributes: [
            [OrderItem.sequelize.literal('SUM(calculated_price)'), 'total'],
            [OrderItem.sequelize.literal('SUM(price)'), 'value'],
            [OrderItem.sequelize.literal('COUNT(id)'), 'count'],
            // 'currency'
          ],
          // group: ['currency']
        })
          .then(count => {
            let data = count.map(c => {
              const cTotal = c instanceof OrderItem.instance
                ? c.get('total') || 0
                : c.total || 0
              const cValue = c instanceof OrderItem.instance
                ? c.get('value') || 0
                : c.value || 0
              const cCount = c instanceof OrderItem.instance
                ? c.get('count') || 0
                : c.count || 0

              return {
                count: parseInt(cCount, 10),
                total: parseInt(cTotal, 10),
                value: parseInt(cValue, 10)
              }
            })

            if (data.length === 0) {
              data = [{
                count: 0,
                total: 0,
                value: 0
              }]
            }

            return data
          })
      })
  }

  /**
   *
   * @param product
   * @returns {*}
   */
  productDefaults(product) {

    // Establish an array of variants
    product.variants = product.variants || []
    product.images = product.images || []
    product.collections = product.collections || []
    product.associations = product.associations || []
    product.tags = product.tags || []
    product.options = []
    product.property_pricing = product.property_pricing || {}
    product.google = product.google || {}
    product.amazon = product.amazon || {}

    // Actual Product Defaults
    if (_.isNil(product.host)) {
      product.host = PRODUCT_DEFAULTS.HOST
    }
    // If not options, set default options
    if (_.isNil(product.options)) {
      product.options = PRODUCT_DEFAULTS.OPTIONS
    }
    // If no tax code set a default tax coe
    if (_.isNil(product.tax_code)) {
      product.tax_code = PRODUCT_DEFAULTS.TAX_CODE
    }
    // If no currency set default currency
    if (_.isNil(product.currency)) {
      product.currency = PRODUCT_DEFAULTS.CURRENCY
    }
    if (_.isNil(product.published_scope)) {
      product.published_scope = PRODUCT_DEFAULTS.PUBLISHED_SCOPE
    }
    // If not established publish status, default status
    if (_.isNil(product.published)) {
      product.published = PRODUCT_DEFAULTS.PUBLISHED
    }
    // If not established availability status, default status
    if (_.isNil(product.available)) {
      product.available = PRODUCT_DEFAULTS.AVAILABLE
    }
    // If not a weight, default weight
    if (_.isNil(product.weight)) {
      product.weight = PRODUCT_DEFAULTS.WEIGHT
    }
    // If not a weight unit, default weight unit
    if (_.isNil(product.weight_unit)) {
      product.weight_unit = PRODUCT_DEFAULTS.WEIGHT_UNIT
    }

    // Variant Defaults for addProduct/updateProduct
    if (_.isNil(product.max_quantity)) {
      product.max_quantity = VARIANT_DEFAULTS.MAX_QUANTITY
    }
    if (_.isNil(product.fulfillment_service)) {
      product.fulfillment_service = VARIANT_DEFAULTS.FULFILLMENT_SERVICE
    }
    if (_.isNil(product.subscription_interval)) {
      product.subscription_interval = VARIANT_DEFAULTS.SUBSCRIPTION_INTERVAL
    }
    if (_.isNil(product.subscription_unit)) {
      product.subscription_unit = VARIANT_DEFAULTS.SUBSCRIPTION_UNIT
    }
    if (_.isNil(product.requires_subscription)) {
      product.requires_subscription = VARIANT_DEFAULTS.REQUIRES_SUBSCRIPTION
    }
    if (_.isNil(product.requires_shipping)) {
      product.requires_shipping = VARIANT_DEFAULTS.REQUIRES_SHIPPING
    }
    if (_.isNil(product.requires_taxes)) {
      product.requires_taxes = VARIANT_DEFAULTS.REQUIRES_TAX
    }
    if (_.isNil(product.inventory_policy)) {
      product.inventory_policy = VARIANT_DEFAULTS.INVENTORY_POLICY
    }
    if (_.isNil(product.inventory_quantity)) {
      product.inventory_quantity = VARIANT_DEFAULTS.INVENTORY_QUANTITY
    }
    if (_.isNil(product.inventory_management)) {
      product.inventory_management = VARIANT_DEFAULTS.INVENTORY_MANAGEMENT
    }
    if (_.isNil(product.inventory_lead_time)) {
      product.inventory_lead_time = VARIANT_DEFAULTS.INVENTORY_LEAD_TIME
    }
    return product
  }
  /**
   *
   * @param variant
   * @param product
   * @returns {*}
   */
  variantDefaults(variant, product) {
    // Defaults for these keys
    variant.images = variant.images || []
    variant.collections = variant.collections || []
    variant.associations = variant.associations || []
    variant.property_pricing = variant.property_pricing || {}

    // If the title set on parent
    if (_.isString(product.title) && _.isNil(variant.title)) {
      variant.title = product.title
    }
    // If the price is set on parent
    // if (_.isNumber(product.price) && _.isNil(variant.price)) {
    //   variant.price = product.price
    // }
    if (product.price && !variant.price) {
      variant.price = product.price
    }

    // If the option is set on parent
    if (_.isObject(product.option) && _.isNil(variant.option)) {
      variant.option = product.option
    }
    // If the barcode is set on parent
    if (_.isString(product.barcode) && _.isNil(variant.barcode)) {
      variant.barcode = product.barcode
    }
    // If the compare at price is set on parent
    if (_.isNumber(product.compare_at_price) && _.isNil(variant.compare_at_price)) {
      variant.compare_at_price = product.compare_at_price
    }
    if (_.isNumber(variant.price) && _.isNil(variant.compare_at_price)) {
      variant.compare_at_price = variant.price
    }
    // If the currency set on parent
    if (_.isString(product.currency) && _.isNil(variant.currency)) {
      variant.currency = product.currency
    }
    // If the fulfillment_service is set on parent
    if (_.isString(product.fulfillment_service) && _.isNil(variant.fulfillment_service)) {
      variant.fulfillment_service = product.fulfillment_service
    }
    // If the requires_shipping is set on parent
    if (_.isBoolean(product.requires_shipping) && _.isNil(variant.requires_shipping)) {
      variant.requires_shipping = product.requires_shipping
    }
    // If the requires_shipping is set on parent
    if (_.isBoolean(product.requires_taxes) && _.isNil(variant.requires_taxes)) {
      variant.requires_taxes = product.requires_taxes
    }
    // If the requires_subscription set on parent
    if (_.isBoolean(product.requires_subscription) && _.isNil(variant.requires_subscription)) {
      variant.requires_subscription = product.requires_subscription
    }
    // If the subscription_interval set on parent
    if (_.isNumber(product.subscription_interval) && _.isNil(variant.subscription_interval)) {
      variant.subscription_interval = product.subscription_interval
    }
    // If the subscription_unit set on parent
    if (_.isString(product.subscription_unit) && _.isNil(variant.subscription_unit)) {
      variant.subscription_unit = product.subscription_unit
    }
    // If the inventory_tracker set on parent
    if (_.isString(product.inventory_tracker) && _.isNil(variant.inventory_tracker)) {
      variant.inventory_tracker = product.inventory_tracker
    }
    // If the inventory_management set on parent
    if (_.isBoolean(product.inventory_management) && _.isNil(variant.inventory_management)) {
      variant.inventory_management = product.inventory_management
    }
    // If the inventory_quantity set on parent
    if (_.isNumber(product.inventory_quantity) && _.isNil(variant.inventory_quantity)) {
      variant.inventory_quantity = product.inventory_quantity
    }
    // If the inventory_policy set on parent
    if (_.isString(product.inventory_policy) && _.isNil(variant.inventory_policy)) {
      variant.inventory_policy = product.inventory_policy
    }
    // If the max_quantity set on parent
    if (_.isNumber(product.max_quantity) && _.isNil(variant.max_quantity)) {
      variant.max_quantity = product.max_quantity
    }
    // Inherit the product type
    if (_.isString(product.type) && _.isNil(variant.type)) {
      variant.type = product.type
    }
    // If the max_quantity set on parent
    if (_.isString(product.tax_code) && _.isNil(variant.tax_code)) {
      variant.tax_code = product.tax_code
    }
    // If the weight set on parent
    if (_.isNumber(product.weight) && _.isNil(variant.weight)) {
      variant.weight = product.weight
    }
    // If the weight_unit set on parent
    if (_.isString(product.weight_unit) && _.isNil(variant.weight_unit)) {
      variant.weight_unit = product.weight_unit
    }
    if (product.property_pricing && _.isEmpty(variant.property_pricing)) {
      variant.property_pricing = product.property_pricing
    }
    return variant
  }

  beforeCreate(product, options) {
    if (product.body) {
      return this.app.services.RenderGenericService.render(product.body)
        .then(doc => {
          product.html = doc.document
          return product
        })
    }
    else {
      return Promise.resolve(product)
    }
  }

  beforeUpdate(product, options) {
    if (product.body) {
      return this.app.services.RenderGenericService.render(product.body)
        .then(doc => {
          product.html = doc.document
          return product
        })
    }
    else {
      return Promise.resolve(product)
    }
  }

  beforeVariantCreate(variant, options) {
    return Promise.resolve(variant)
  }

  beforeVariantUpdate(variant, options) {
    return Promise.resolve(variant)
  }
}

