'use strict'
/* global describe, it */
const assert = require('assert')
const supertest = require('supertest')
const _ = require('lodash')
const qs = require('qs')

describe('Admin User ProductController', () => {
  let adminUser, userID, customerID
  let createdProductID
  let defaultVariantID
  let firstVariantID
  let firstImageID
  let uploadID
  let uploadMetaID
  let createdVariantID
  let firstProductImageId
  let firstVariantImageId

  before((done) => {

    adminUser = supertest.agent(global.app.spools.express.server)
    // Login as Admin
    adminUser
      .post('/auth/local')
      .set('Accept', 'application/json') //set header for this test
      .send({ username: 'admin', password: 'admin1234' })
      .expect(200)
      .end((err, res) => {
        assert.ok(res.body.user.id)
        assert.ok(res.body.user.current_customer_id)
        userID = res.body.user.id
        customerID = res.body.user.current_customer_id
        done(err)
      })
  })
  it('should exist', () => {
    assert(global.app.api.controllers['ProductController'])
  })

  it('should get general stats', (done) => {
    adminUser
      .get('/product/generalStats')
      .expect(200)
      .end((err, res) => {
        assert.ok(res.body)
        done(err)
      })
  })
  it('should make addProduct post adminUser', (done) => {
    adminUser
      .post('/product')
      .send(
        {
          handle: 'chalk-bag',
          title: 'Chalk Bag',
          body: 'Chalk Bag',
          vendors: [
            'B.A.G'
          ],
          type: 'Chalk Bag',
          price: '10000',
          published: true,
          tags: [
            'climbing',
            'equipment',
            'outdoor'
          ],
          collections: [
            'fire sale'
          ],
          metadata: {
            test: 'value'
          },
          sku: 'chalk-123',
          option: { capacity: '28 grams' },
          weight: 1,
          weight_unit: 'lb',
          images: [
            {
              src: 'https://placeholdit.imgix.net/~text?txtsize=33&txt=350%C3%97150&w=350&h=150',
              alt: 'Chalk Bag'
            }
          ]
        }
      )
      .expect(200)
      .end((err, res) => {
        // Product
        assert.ok(res.body.id)
        assert.equal(res.body.handle, 'chalk-bag')
        assert.equal(res.body.title, 'Chalk Bag')
        assert.equal(res.body.seo_title, 'Chalk Bag')
        assert.equal(res.body.seo_description, 'Chalk Bag')
        assert.notEqual(res.body.vendors.indexOf('B.A.G'), -1)
        assert.equal(res.body.type, 'Chalk Bag')
        assert.notEqual(res.body.options.indexOf('capacity'), -1)
        // Metadata
        assert.equal(res.body.metadata.test, 'value')
        // Collections
        assert.equal(res.body.collections.length, 1)
        assert.equal(res.body.collections[0].handle, 'fire-sale')
        // Tags
        assert.equal(res.body.tags.length, 3)
        assert.notEqual(res.body.tags.indexOf('climbing'), -1)
        assert.notEqual(res.body.tags.indexOf('equipment'), -1)
        assert.notEqual(res.body.tags.indexOf('outdoor'), -1)

        // Images
        let imagePos = 1
        res.body.images.forEach(image => {
          assert.ok(image.src)
          assert.ok(image.full)
          assert.ok(image.thumbnail)
          assert.ok(image.small)
          assert.ok(image.medium)
          assert.ok(image.large)
          assert.equal(image.position, imagePos)
          imagePos++
        })

        // Variants
        assert.equal(res.body.variants.length, 1)
        assert.equal(res.body.variants[0].position, 1)

        assert.equal(res.body.variants[0].product_id, res.body.id)
        assert.equal(res.body.variants[0].sku, 'chalk-123')
        assert.equal(res.body.variants[0].title, res.body.title)
        assert.equal(res.body.variants[0].price, res.body.price)
        assert.equal(res.body.variants[0].weight, res.body.weight)
        assert.equal(res.body.variants[0].weight_unit, res.body.weight_unit)
        assert.equal(res.body.variants[0].option.capacity, '28 grams')
        done(err)
      })
  })
  it('should make addProducts post adminUser', (done) => {
    adminUser
      .post('/product/addProducts')
      .send([
        {
          handle: 'snowboard',
          title: 'Burton Custom Freestyle 151',
          body: '<strong>Good snowboard!</strong>',
          vendors: [
            'Burton'
          ],
          type: 'Snowboard',
          price: '10000',
          published: true,
          tags: [
            'snow',
            'equipment',
            'outdoor'
          ],
          collections: [
            'fire sale'
          ],
          metadata: {
            test: 'value'
          },
          sku: 'board-m-123',
          option: { width: '18in' },
          weight: 20,
          weight_unit: 'lb',
          images: [
            {
              src: 'https://placeholdit.imgix.net/~text?txtsize=33&txt=29&w=350&h=150',
              alt: 'Hello World'
            }
          ],
          variants: [
            {
              title: 'Women\'s Burton Custom Freestyle 151',
              price: '10001',
              sku: 'board-w-123',
              option: { size: '44in' },
              images: [
                {
                  src: 'https://placeholdit.imgix.net/~text?txtsize=33&txt=30&w=350&h=150',
                  alt: 'Hello World 2'
                }
              ]
            }
          ]
        }
      ])
      .expect(200)
      .end((err, res) => {
        createdProductID = res.body[0].id
        defaultVariantID = res.body[0].variants[0].id
        firstVariantID = res.body[0].variants[1].id
        firstImageID = res.body[0].images[0].id
        // Product
        assert.ok(createdProductID)
        assert.equal(res.body[0].handle, 'snowboard')
        assert.equal(res.body[0].title, 'Burton Custom Freestyle 151')
        assert.equal(res.body[0].seo_title, 'Burton Custom Freestyle 151')
        assert.equal(res.body[0].seo_description, 'Good snowboard!')
        assert.notEqual(res.body[0].vendors.indexOf('Burton'), -1)
        assert.equal(res.body[0].type, 'Snowboard')
        assert.notEqual(res.body[0].options.indexOf('size'), -1)
        assert.notEqual(res.body[0].options.indexOf('width'), -1)
        // Metadata
        assert.equal(res.body[0].metadata.test, 'value')
        // Collections
        assert.equal(res.body[0].collections.length, 1)
        assert.equal(res.body[0].collections[0].handle, 'fire-sale')
        // Tags
        // assert.equal(res.body[0].tags.length, 3)
        assert.notEqual(res.body[0].tags.indexOf('snow'), -1)
        assert.notEqual(res.body[0].tags.indexOf('equipment'), -1)
        assert.notEqual(res.body[0].tags.indexOf('outdoor'), -1)
        // Images
        assert.equal(res.body[0].images.length, 2)
        assert.equal(res.body[0].images[0].position, 1)
        assert.equal(res.body[0].images[1].position, 2)
        assert.equal(res.body[0].images[0].product_id, createdProductID)
        assert.equal(res.body[0].images[0].product_variant_id, defaultVariantID)
        assert.equal(res.body[0].images[0].alt, 'Hello World')

        let imagePos = 1
        res.body[0].images.forEach(image => {
          assert.equal(image.product_id, createdProductID)
          assert.ok(image.src)
          assert.ok(image.full)
          assert.ok(image.thumbnail)
          assert.ok(image.small)
          assert.ok(image.medium)
          assert.ok(image.large)
          assert.equal(image.position, imagePos)
          imagePos++
        })

        // Variants
        assert.equal(res.body[0].variants.length, 2)

        let variantPos = 1
        res.body[0].variants.forEach(variant => {
          assert.equal(variant.product_id, createdProductID)
          assert.equal(variant.position, variantPos)
          variantPos++
        })

        assert.equal(res.body[0].variants[0].sku, 'board-m-123')
        assert.equal(res.body[0].variants[0].title, res.body[0].title)
        assert.equal(res.body[0].variants[0].price, res.body[0].price)
        assert.equal(res.body[0].variants[0].weight, res.body[0].weight)
        assert.equal(res.body[0].variants[0].weight_unit, res.body[0].weight_unit)
        assert.equal(res.body[0].variants[0].option.width, '18in')

        assert.equal(res.body[0].variants[1].sku, 'board-w-123')
        assert.equal(res.body[0].variants[1].title, 'Women\'s Burton Custom Freestyle 151')
        assert.equal(res.body[0].variants[1].price, '10001')
        assert.equal(res.body[0].variants[1].weight, '20')
        assert.equal(res.body[0].variants[1].weight_unit, 'lb')
        assert.equal(res.body[0].variants[1].option.size, '44in')
        done(err)
      })
  })
  it('should find created product', (done) => {
    adminUser
      .get(`/product/${createdProductID}`)
      .expect(200)
      .end((err, res) => {
        // Product
        assert.equal(res.body.id, createdProductID)
        assert.equal(res.body.handle, 'snowboard')
        assert.equal(res.body.title, 'Burton Custom Freestyle 151')
        assert.equal(res.body.seo_title, 'Burton Custom Freestyle 151')
        assert.equal(res.body.seo_description, 'Good snowboard!')
        assert.notEqual(res.body.vendors.indexOf('Burton'), -1)
        assert.equal(res.body.type, 'Snowboard')
        // Metadata
        assert.equal(res.body.metadata.test, 'value')
        // Collections
        assert.equal(res.body.collections.length, 1)
        assert.equal(res.body.collections[0].handle, 'fire-sale')
        // Tags
        assert.equal(res.body.tags.length, 3)
        assert.notEqual(res.body.tags.indexOf('snow'), -1)
        assert.notEqual(res.body.tags.indexOf('equipment'), -1)
        assert.notEqual(res.body.tags.indexOf('outdoor'), -1)
        // Images
        assert.equal(res.body.images.length, 2)
        firstProductImageId = res.body.images[0].id
        let imagePos = 1
        res.body.images.forEach(image => {
          assert.equal(image.product_id, createdProductID)
          assert.ok(image.src)
          assert.ok(image.full)
          assert.ok(image.thumbnail)
          assert.ok(image.small)
          assert.ok(image.medium)
          assert.ok(image.large)
          assert.equal(image.position, imagePos)
          imagePos++
        })

        assert.equal(res.body.images[0].product_id, createdProductID)
        assert.equal(res.body.images[0].product_variant_id, defaultVariantID)
        assert.equal(res.body.images[0].position, 1)
        assert.equal(res.body.images[0].alt, 'Hello World')

        assert.equal(res.body.images[1].product_id, createdProductID)
        assert.equal(res.body.images[1].product_variant_id, firstVariantID)
        assert.equal(res.body.images[1].position, 2)
        assert.equal(res.body.images[1].alt, 'Hello World 2')

        // Variants
        assert.equal(res.body.variants.length, 2)
        let variantPos = 1
        res.body.variants.forEach(variant => {
          assert.equal(variant.product_id, createdProductID)
          assert.equal(variant.position, variantPos)
          variantPos++
        })

        assert.equal(res.body.variants[0].title, res.body.title)
        assert.equal(res.body.variants[0].price, res.body.price)
        assert.equal(res.body.variants[0].weight, res.body.weight)
        assert.equal(res.body.variants[0].weight_unit, res.body.weight_unit)

        assert.equal(res.body.variants[1].title, 'Women\'s Burton Custom Freestyle 151')
        assert.equal(res.body.variants[1].price, '10001')
        assert.equal(res.body.variants[1].weight, res.body.weight)
        assert.equal(res.body.variants[1].weight_unit, res.body.weight_unit)

        done(err)
      })
  })
  it('should count products, variants, images', (done) => {
    adminUser
      .get('/product/count')
      .expect(200)
      .end((err, res) => {
        assert.ok(_.isNumber(res.body.products))
        assert.ok(_.isNumber(res.body.variants))
        assert.ok(_.isNumber(res.body.images))
        done(err)
      })
  })
  it('should make updateProducts post adminUser', (done) => {
    adminUser
      .post('/product/updateProducts')
      .send([
        {
          id: createdProductID,
          // Updates Title
          title: 'Burton Custom Freestyle 151 Gen 2',
          // Updates Metdata
          metadata: {
            test: 'new value'
          },
          // Add new collections
          collections: [
            'free-shipping'
          ],
          images: [
            // Updates Image alt Tag
            {
              id: firstProductImageId,
              alt: 'Hello World 2 Updated'
            },
            // Creates new Image
            {
              src: 'https://placeholdit.imgix.net/~text?txtsize=33&txt=31&w=350&h=150',
              alt: 'Hello World 3'
            }
          ],
          variants: [
            // Updates Variant
            {
              id: firstVariantID,
              title: 'Women\'s Burton Custom Freestyle 151 Updated',
              option: { size: '44in' }
            },
            // Creates new Variant
            {
              title: 'Youth Burton Custom Freestyle 151',
              sku: 'board-y-123',
              option: { size: '36in' },
              images: [
                {
                  src: 'https://placeholdit.imgix.net/~text?txtsize=33&txt=32&w=350&h=150',
                  alt: 'Hello World 4'
                }
              ]
            }
          ],
          property_pricing: {
            long_snowboard: {
              name: 'long_snowboard',
              price: 2100
            }
          }
        }
      ])
      .expect(200)
      .end((err, res) => {
        assert.equal(res.body[0].id, createdProductID)
        assert.equal(res.body[0].title, 'Burton Custom Freestyle 151 Gen 2')
        assert.deepEqual(res.body[0].options, ['width', 'size'])
        // Metadata
        assert.equal(res.body[0].metadata.test, 'new value')
        // Collections
        assert.equal(res.body[0].collections.length, 2)
        assert.equal(res.body[0].collections.map(c => c.handle).indexOf('free-shipping') > -1, true)
        // assert.equal(res.body[0].collections[0].title, 'free-shipping')
        // assert.equal(res.body[0].collections[0].handle, 'free-shipping')
        // Variants
        assert.equal(res.body[0].variants.length, 3)
        let variantPos = 1
        res.body[0].variants.forEach(variant => {
          assert.equal(variant.product_id, createdProductID)
          assert.equal(variant.position, variantPos)
          variantPos++
        })
        assert.equal(res.body[0].variants[0].position, 1)
        assert.equal(res.body[0].variants[1].position, 2)
        assert.equal(res.body[0].variants[2].position, 3)
        assert.equal(res.body[0].variants[0].title, res.body[0].title)
        assert.equal(res.body[0].variants[2].title, 'Women\'s Burton Custom Freestyle 151 Updated')
        assert.equal(res.body[0].variants[1].title, 'Youth Burton Custom Freestyle 151')

        // Images
        assert.equal(res.body[0].images.length, 4)
        let imagePos = 1
        res.body[0].images.forEach(image => {
          assert.equal(image.product_id, createdProductID)
          assert.ok(image.src)
          assert.ok(image.full)
          assert.ok(image.thumbnail)
          assert.ok(image.small)
          assert.ok(image.medium)
          assert.ok(image.large)
          assert.equal(image.position, imagePos)
          imagePos++
        })

        // Property Based Pricing
        assert.equal(res.body[0].property_pricing.long_snowboard.name, 'long_snowboard')
        assert.equal(res.body[0].property_pricing.long_snowboard.price, 2100)

        done(err)
      })
  })
  it('should find updated product', (done) => {
    adminUser
      .get(`/product/${createdProductID}`)
      .expect(200)
      .end((err, res) => {
        assert.equal(res.body.id, createdProductID)
        assert.equal(res.body.title, 'Burton Custom Freestyle 151 Gen 2')
        assert.deepEqual(res.body.options, ['width', 'size'])
        // Variants
        assert.equal(res.body.variants.length, 3)
        let variantPos = 1
        res.body.variants.forEach(variant => {
          assert.equal(variant.product_id, createdProductID)
          assert.equal(variant.position, variantPos)
          variantPos++
        })

        // Images
        assert.equal(res.body.images.length, 4)
        let imagePos = 1
        res.body.images.forEach(image => {
          assert.equal(image.product_id, createdProductID)
          assert.ok(image.src)
          assert.ok(image.full)
          assert.ok(image.thumbnail)
          assert.ok(image.small)
          assert.ok(image.medium)
          assert.ok(image.large)
          assert.equal(image.position, imagePos)
          imagePos++
        })

        // Collections
        assert.equal(res.body.collections.length, 2)
        assert.equal(res.body.collections.map(c => c.handle).indexOf('free-shipping') > -1, true)
        // assert.equal(res.body.collections[0].title, 'free-shipping')
        // assert.equal(res.body.collections[0].handle, 'free-shipping')


        // Property Based Pricing
        assert.equal(res.body.property_pricing.long_snowboard.name, 'long_snowboard')
        assert.equal(res.body.property_pricing.long_snowboard.price, 2100)

        done(err)
      })
  })

  // TODO complete test
  it('should list product analytics', (done) => {
    adminUser
      .get(`/product/${createdProductID}/analytics`)
      .expect(200)
      .end((err, res) => {
        assert.ok(res.body)
        assert.equal(res.body.length, 1)
        assert.equal(res.body[0].total, 0)
        assert.equal(res.body[0].value, 0)
        assert.equal(res.body[0].count, 0)
        done(err)
      })
  })
  
  it('should add tag to product', (done) => {
    adminUser
      .post(`/product/${createdProductID}/addTag/test`)
      .send({})
      .expect(200)
      .end((err, res) => {
        assert.equal(res.body.id, createdProductID)
        assert.equal(res.body.tags.length, 4)
        assert.notEqual(res.body.tags.indexOf('test'), -1)
        done(err)
      })
  })

  it('should remove tag to product', (done) => {
    adminUser
      .post(`/product/${createdProductID}/removeTag/test`)
      .send({})
      .expect(200)
      .end((err, res) => {
        assert.equal(res.body.id, createdProductID)
        assert.equal(res.body.tags.length, 3)
        assert.equal(res.body.tags.indexOf('test'), -1)
        done(err)
      })
  })
  it('should add collection to product', (done) => {
    adminUser
      .post(`/product/${createdProductID}/collection/test`)
      .send({
        product_position: 1
      })
      .expect(200)
      .end((err, res) => {
        assert.equal(res.body.handle, 'test')
        // assert.equal(res.body.id, createdProductID)
        // const collections = _.map(res.body.collections,'handle')
        // assert.notEqual(collections.indexOf('test'), -1 )
        done(err)
      })
  })
  it('should update the position in the collection', (done) => {
    adminUser
      .post(`/product/${createdProductID}/addCollection/test`)
      .send({
        product_position: 2
      })
      .expect(200)
      .end((err, res) => {
        assert.equal(res.body.handle, 'test')
        // console.log('WORKING ON COLLECTIONS', res.body.collections)
        // assert.equal(res.body.id, createdProductID)
        // const collections = _.map(res.body.collections,'handle')
        // assert.notEqual(collections.indexOf('test'), -1 )
        done(err)
      })
  })
  it('should remove collection from product', (done) => {
    adminUser
      .post(`/product/${createdProductID}/removeCollection/test`)
      .send({})
      .expect(200)
      .end((err, res) => {
        assert.equal(res.body.handle, 'test')
        // assert.equal(res.body.id, createdProductID)
        // const collections = _.map(res.body.collections,'handle')
        // assert.equal(collections.indexOf('test'), -1 )
        done(err)
      })
  })
  it('should add association to product', (done) => {
    adminUser
      .post(`/product/${createdProductID}/association/1`)
      .send({})
      .expect(200)
      .end((err, res) => {
        assert.equal(res.body.id, 1)
        done(err)
      })
  })
  // TODO complete test
  it('should show associations of a product', (done) => {
    adminUser
      .get(`/product/${createdProductID}/associations`)
      .expect(200)
      .end((err, res) => {
        assert.ok(res.headers['x-pagination-total'])
        assert.ok(res.headers['x-pagination-pages'])
        assert.ok(res.headers['x-pagination-page'])
        assert.ok(res.headers['x-pagination-limit'])
        assert.ok(res.headers['x-pagination-offset'])
        assert.ok(res.headers['x-pagination-sort'])
        assert.equal(res.headers['x-pagination-total'], '1')
        assert.equal(res.headers['x-pagination-offset'], '0')
        assert.equal(res.headers['x-pagination-limit'], '10')
        assert.equal(res.headers['x-pagination-page'], '1')
        assert.equal(res.headers['x-pagination-pages'], '1')
        // console.log('Show Associations', createdProductID, res.body)
        assert.equal(res.body.length, 1)
        done(err)
      })
  })

  it('should add associations to product', (done) => {
    adminUser
      .post(`/product/${createdProductID}/associations`)
      .send(qs.stringify({
        associations: [1, 2]
      }))
      .expect(200)
      .end((err, res) => {
        console.log('FIX BROKE ASSOCs', res.body)
        // assert.equal(res.body.length, 2)
        assert.ok(res.body.length)
        done(err)
      })
  })

  // TODO complete test
  it('should show relations of product', (done) => {
    adminUser
      .get(`/product/${createdProductID}/relations`)
      .expect(200)
      .end((err, res) => {
        assert.ok(res.headers['x-pagination-total'])
        assert.ok(res.headers['x-pagination-pages'])
        assert.ok(res.headers['x-pagination-page'])
        assert.ok(res.headers['x-pagination-limit'])
        assert.ok(res.headers['x-pagination-offset'])
        assert.ok(res.headers['x-pagination-sort'])
        // assert.equal(res.headers['x-pagination-total'], '1')
        // assert.equal(res.headers['x-pagination-offset'], '0')
        // assert.equal(res.headers['x-pagination-limit'], '10')
        // assert.equal(res.headers['x-pagination-page'], '1')
        // assert.equal(res.headers['x-pagination-pages'], '1')
        // console.log('Show Associations', createdProductID, res.body)
        // assert.equal(res.body.length, 1)
        done(err)
      })
  })
  // TODO complete test
  it('should show similar suggestions of product', (done) => {
    adminUser
      .get(`/product/${createdProductID}/suggestions`)
      .expect(200)
      .end((err, res) => {
        assert.ok(res.headers['x-pagination-total'])
        assert.ok(res.headers['x-pagination-pages'])
        assert.ok(res.headers['x-pagination-page'])
        assert.ok(res.headers['x-pagination-limit'])
        assert.ok(res.headers['x-pagination-offset'])
        assert.ok(res.headers['x-pagination-sort'])

        assert.equal(_.isNumber(parseInt(res.headers['x-pagination-total'])), true)
        assert.equal(_.isNumber(parseInt(res.headers['x-pagination-offset'])), true)
        assert.equal(_.isNumber(parseInt(res.headers['x-pagination-limit'])), true)
        assert.equal(_.isNumber(parseInt(res.headers['x-pagination-page'])), true)
        assert.equal(_.isNumber(parseInt(res.headers['x-pagination-pages'])), true)
        // assert.equal(res.headers['x-pagination-total'], '1')
        // assert.equal(res.headers['x-pagination-offset'], '0')
        // assert.equal(res.headers['x-pagination-limit'], '10')
        // assert.equal(res.headers['x-pagination-page'], '1')
        // assert.equal(res.headers['x-pagination-pages'], '1')
        // console.log('Show Associations', createdProductID, res.body)
        // assert.equal(res.body.length, 1)
        done(err)
      })
  })
  // TODO complete test
  it('should remove association from product', (done) => {
    adminUser
      .delete(`/product/${createdProductID}/association/1`)
      .send({})
      .expect(200)
      .end((err, res) => {
        assert.equal(res.body.id, createdProductID)
        done(err)
      })
  })
  // TODO complete test
  it('should add shop to product', (done) => {
    adminUser
      .post(`/product/${createdProductID}/shop/1`)
      .send({})
      .expect(200)
      .end((err, res) => {
        // assert.equal(res.body.id, createdProductID)
        assert.equal(res.body.id, 1)
        done(err)
      })
  })
  it('should show shops of a product', (done) => {
    adminUser
      .get(`/product/${createdProductID}/shops`)
      .expect(200)
      .end((err, res) => {
        assert.ok(res.headers['x-pagination-total'])
        assert.ok(res.headers['x-pagination-pages'])
        assert.ok(res.headers['x-pagination-page'])
        assert.ok(res.headers['x-pagination-limit'])
        assert.ok(res.headers['x-pagination-offset'])
        assert.ok(res.headers['x-pagination-sort'])
        assert.equal(res.headers['x-pagination-total'], '1')
        assert.equal(res.headers['x-pagination-offset'], '0')
        assert.equal(res.headers['x-pagination-limit'], '10')
        assert.equal(res.headers['x-pagination-page'], '1')
        assert.equal(res.headers['x-pagination-pages'], '1')
        assert.equal(res.body.length, 1)
        done(err)
      })
  })
  // TODO complete test
  it('should remove shop from product', (done) => {
    adminUser
      .delete(`/product/${createdProductID}/shop/1`)
      .send({})
      .expect(200)
      .end((err, res) => {
        // assert.equal(res.body.id, createdProductID)
        assert.equal(res.body.id, 1)
        done(err)
      })
  })

  it('should add a vendor to product', (done) => {
    adminUser
      .post(`/product/${createdProductID}/vendor/1`)
      .send({})
      .expect(200)
      .end((err, res) => {
        assert.equal(res.body.id, 1)
        // assert.equal(res.body.id, createdProductID)
        // assert.notEqual(res.body.vendors.indexOf('Makerbot'), -1)
        done(err)
      })
  })
  // TODO complete test
  it('should show vendors of product', (done) => {
    adminUser
      .get(`/product/${createdProductID}/vendors`)
      .expect(200)
      .end((err, res) => {
        assert.ok(res.headers['x-pagination-total'])
        assert.ok(res.headers['x-pagination-pages'])
        assert.ok(res.headers['x-pagination-page'])
        assert.ok(res.headers['x-pagination-limit'])
        assert.ok(res.headers['x-pagination-offset'])
        assert.equal(res.headers['x-pagination-total'], '2')
        assert.equal(res.headers['x-pagination-offset'], '0')
        assert.equal(res.headers['x-pagination-limit'], '10')
        assert.equal(res.headers['x-pagination-page'], '1')
        assert.equal(res.headers['x-pagination-pages'], '1')
        assert.equal(res.body.length, 2)
        done(err)
      })
  })
  it('should remove a vendor from product', (done) => {
    adminUser
      .delete(`/product/${createdProductID}/vendor/1`)
      .send({})
      .expect(200)
      .end((err, res) => {
        assert.equal(res.body.id, 1)
        // assert.equal(res.body.id, createdProductID)
        // assert.equal(res.body.vendors.indexOf('Makerbot'), -1 )
        done(err)
      })
  })
  // TODO complete test
  it('should show reviews of product', (done) => {
    adminUser
      .get(`/product/${createdProductID}/reviews`)
      .expect(200)
      .end((err, res) => {
        assert.equal(res.body.length, 0)
        done(err)
      })
  })
  it('should make get product images', (done) => {
    adminUser
      .get(`/product/${createdProductID}/images`)
      .expect(200)
      .end((err, res) => {
        assert.ok(res.headers['x-pagination-total'])
        assert.ok(res.headers['x-pagination-pages'])
        assert.ok(res.headers['x-pagination-page'])
        assert.ok(res.headers['x-pagination-limit'])
        assert.ok(res.headers['x-pagination-offset'])
        assert.equal(res.headers['x-pagination-total'], '4')
        assert.equal(res.headers['x-pagination-offset'], '0')
        assert.equal(res.headers['x-pagination-limit'], '10')
        assert.equal(res.headers['x-pagination-page'], '1')
        assert.equal(res.headers['x-pagination-pages'], '1')
        assert.equal(res.body.length, 4)
        done(err)
      })
  })
  // TODO complete test
  it('should make removeImage post adminUser', (done) => {
    adminUser
      .delete(`/product/${createdProductID}/image/${firstImageID}`)
      .send({})
      .expect(200)
      .end((err, res) => {
        // Should return the image that was destroyed
        assert.equal(res.body.id, firstImageID)
        assert.equal(res.body.product_id, createdProductID)
        // Deprecated
        // assert.equal(res.body.id, createdProductID)
        // assert.equal(res.body.images.length, 3)
        // const images = _.map(res.body.images, 'id')
        // assert.equal(images.indexOf(firstImageID), -1)

        done(err)
      })
  })
  it('Image should be removed', (done) => {
    adminUser
      .get(`/product/${createdProductID}`)
      .expect(200)
      .end((err, res) => {
        assert.equal(res.body.images.length, 3)
        done(err)
      })
  })
  it('Create a New image and add it to a product', (done) => {
    adminUser
      .post(`/product/${createdProductID}/image/create`)
      .attach('file', 'test/fixtures/test.jpg')
      .expect(200)
      .end((err, res) => {
        // console.log('UPLOADED IMAGE',res.body)
        assert.equal(res.body.product_id, createdProductID)
        done(err)
      })
  })
  it('should make createVariant post adminUser', (done) => {
    adminUser
      .post(`/product/${createdProductID}/variant`)
      .send({
        sku: 'bscb-1',
        title: 'Burton Super Custom Board',
        option: { size: '700in', hover: '1000 feet' },
        price: 100000,
        property_pricing: {
          long_snowboard: {
            name: 'long_snowboard',
            price: 2100
          }
        }
      })
      .expect(200)
      .end((err, res) => {
        createdVariantID = res.body.id
        assert.equal(res.body.product_id, createdProductID)
        assert.equal(res.body.sku, 'bscb-1')
        assert.equal(res.body.price, 100000)

        // property based pricing
        assert.equal(res.body.property_pricing.long_snowboard.name, 'long_snowboard')
        assert.equal(res.body.property_pricing.long_snowboard.price, 2100)
        done(err)
      })
  })
  it('should find updated product', (done) => {
    adminUser
      .get(`/product/${createdProductID}`)
      .expect(200)
      .end((err, res) => {
        assert.equal(res.body.id, createdProductID)
        assert.equal(res.body.title, 'Burton Custom Freestyle 151 Gen 2')
        assert.deepEqual(res.body.options, ['width', 'size', 'hover'])
        assert.equal(res.body.total_variants, 4)
        // Variants
        assert.equal(res.body.variants.length, 4)
        let variantPos = 1
        res.body.variants.forEach(variant => {
          assert.equal(variant.product_id, createdProductID)
          assert.equal(variant.position, variantPos)
          variantPos++
        })

        // Images
        assert.equal(res.body.images.length, 4)
        let imagePos = 1
        res.body.images.forEach(image => {
          assert.equal(image.product_id, createdProductID)
          assert.ok(image.src)
          assert.ok(image.full)
          assert.ok(image.thumbnail)
          assert.ok(image.small)
          assert.ok(image.medium)
          assert.ok(image.large)
          assert.equal(image.position, imagePos)
          imagePos++
        })
        done(err)
      })
  })
  it('Create a New image and add it to a product variant', (done) => {
    adminUser
      .post(`/product/${createdProductID}/variant/${createdVariantID}/image/create`)
      .attach('file', 'test/fixtures/test.jpg')
      .expect(200)
      .end((err, res) => {

        // console.log('UPLOADED IMAGE',res.body)
        assert.equal(res.body.product_id, createdProductID)
        assert.equal(res.body.product_variant_id, createdVariantID)
        done(err)
      })
  })

  it('should make get product variant images', (done) => {
    adminUser
      .get(`/product/${createdProductID}/variant/${createdVariantID}/images`)
      .expect(200)
      .end((err, res) => {
        assert.ok(res.headers['x-pagination-total'])
        assert.ok(res.headers['x-pagination-pages'])
        assert.ok(res.headers['x-pagination-page'])
        assert.ok(res.headers['x-pagination-limit'])
        assert.ok(res.headers['x-pagination-offset'])
        assert.equal(res.headers['x-pagination-total'], '1')
        assert.equal(res.headers['x-pagination-offset'], '0')
        assert.equal(res.headers['x-pagination-limit'], '10')
        assert.equal(res.headers['x-pagination-page'], '1')
        assert.equal(res.headers['x-pagination-pages'], '1')
        assert.equal(res.body.length, 1)
        done(err)
      })
  })
  it('should make updateVariant post adminUser', (done) => {
    adminUser
      .post(`/product/${createdProductID}/variant/${createdVariantID}`)
      .send({
        price: 100001,
        images: [{
          position: 0,
          src: 'https://www.w3schools.com/w3css/img_lights.jpg',
          alt: 'Northern Lights'
        }]
      })
      .expect(200)
      .end((err, res) => {
        assert.equal(res.body.id, createdVariantID)
        assert.equal(res.body.product_id, createdProductID)
        assert.equal(res.body.sku, 'bscb-1')
        assert.equal(res.body.price, 100001)
        assert.equal(res.body.images.length, 1)
        res.body.images.forEach(image => {
          assert.equal(image.product_variant_id, createdVariantID)
        })

        firstVariantImageId = res.body.images[0].id
        done(err)
      })
  })
  it('should remove variant image', (done) => {
    adminUser
      .delete(`/product/${createdProductID}/variant/${createdVariantID}/image/${firstVariantImageId}`)
      .send({})
      .expect(200)
      .end((err, res) => {
        assert.equal(res.body.id, firstVariantImageId)
        assert.equal(res.body.product_id, createdProductID)
        // Deprecated
        // assert.equal(res.body.id, createdVariantID)
        // assert.equal(res.body.product_id, createdProductID)
        // assert.equal(res.body.images.length, 0)
        // const images = _.map(res.body.images, 'id')
        // assert.equal(images.indexOf(firstVariantImageId), -1)

        done(err)
      })
  })
  it('variant image should be removed', (done) => {
    adminUser
      .get(`/product/${createdProductID}/variant/${createdVariantID}`)
      .expect(200)
      .end((err, res) => {
        assert.equal(res.body.id, createdVariantID)
        assert.equal(res.body.product_id, createdProductID)
        assert.equal(res.body.images.length, 0)
        done(err)
      })
  })
  it('should make add variant image post adminUser', (done) => {
    adminUser
      .post(`/product/${createdProductID}/variant/${createdVariantID}/images`)
      .send({
        position: 0,
        src: 'https://www.w3schools.com/w3css/img_lights.jpg',
        alt: 'Northern Lights'
      })
      .expect(200)
      .end((err, res) => {
        assert.equal(res.body.product_id, createdProductID)
        assert.equal(res.body.product_variant_id, createdVariantID)
        firstVariantImageId = res.body.id
        done(err)
      })
  })
  it('should make get product variants', (done) => {
    adminUser
      .get(`/product/${createdProductID}/variants`)
      .expect(200)
      .end((err, res) => {
        assert.ok(res.headers['x-pagination-total'])
        assert.ok(res.headers['x-pagination-pages'])
        assert.ok(res.headers['x-pagination-page'])
        assert.ok(res.headers['x-pagination-limit'])
        assert.ok(res.headers['x-pagination-offset'])
        assert.equal(res.headers['x-pagination-total'], '4')
        assert.equal(res.headers['x-pagination-offset'], '0')
        assert.equal(res.headers['x-pagination-limit'], '10')
        assert.equal(res.headers['x-pagination-page'], '1')
        assert.equal(res.headers['x-pagination-pages'], '1')
        assert.equal(res.body.length, 4)
        res.body.forEach(variant => {
          assert.equal(variant.product_id, createdProductID)
        })
        done(err)
      })
  })


  // TODO complete test
  it('should add association to product variant', (done) => {
    adminUser
      .post(`/product/${createdProductID}/variant/${createdVariantID}/association/1`)
      .send({})
      .expect(200)
      .end((err, res) => {
        console.log('BRK', err, res.body)
        // assert.equal(res.body[0].id, 1)
        done(err)
      })
  })
  it.skip('should add associations to product variant', (done) => {
    adminUser
      .post(`/product/${createdProductID}/variant/${createdVariantID}/associations`)
      .send({})
      .expect(200)
      .end((err, res) => {
        console.log('BRK', err, res.body)
        // assert.equal(res.body[0].id, 1)
        done(err)
      })
  })
  it('should add association to product variant', (done) => {
    adminUser
      .post(`/product/${createdProductID}/variant/${createdVariantID}/associations`)
      .send({
        associations: [
          {
            variant_id: 1
          }
        ]
      })
      .expect(200)
      .end((err, res) => {
        assert.equal(res.body.length, 1)
        assert.equal(res.body[0].id, 1)
        done(err)
      })
  })
  // TODO complete test
  it('should show associations of a product variant', (done) => {
    adminUser
      .get(`/product/${createdProductID}/variant/${createdVariantID}/associations`)
      .expect(200)
      .end((err, res) => {
        assert.ok(res.headers['x-pagination-total'])
        assert.ok(res.headers['x-pagination-pages'])
        assert.ok(res.headers['x-pagination-page'])
        assert.ok(res.headers['x-pagination-limit'])
        assert.ok(res.headers['x-pagination-offset'])
        assert.ok(res.headers['x-pagination-sort'])
        assert.equal(res.headers['x-pagination-total'], '1')
        assert.equal(res.headers['x-pagination-offset'], '0')
        assert.equal(res.headers['x-pagination-limit'], '10')
        assert.equal(res.headers['x-pagination-page'], '1')
        assert.equal(res.headers['x-pagination-pages'], '1')
        assert.equal(res.body.length, 1)
        done(err)
      })
  })

  it('should add association to product variant', (done) => {
    adminUser
      .post(`/product/variant/${createdVariantID}/associations`)
      .send(qs.stringify({
        associations: [1, 2]
      }))
      .expect(200)
      .end((err, res) => {
        console.log('BROKE ASSOC', res.body)
        assert.ok(res.body.length)
        done(err)
      })
  })

  // it('should remove association to product variant', (done) => {
  //   adminUser
  //     .post(`/product/variant/${createdVariantID}/removeAssociation/1`)
  //     .send({})
  //     .expect(200)
  //     .end((err, res) => {
  //       assert.equal(res.body.id, createdVariantID)
  //       done(err)
  //     })
  // })

  it('should remove association to product variant', (done) => {
    adminUser
      .delete(`/product/${createdProductID}/variant/${createdVariantID}/association/1`)
      .send({})
      .expect(200)
      .end((err, res) => {
        assert.equal(res.body.id, createdVariantID)
        done(err)
      })
  })

  it('should make removeVariant post adminUser', (done) => {
    adminUser
      .delete(`/product/${createdProductID}/variant/${firstVariantID}`)
      .send({})
      .expect(200)
      .end((err, res) => {
        assert.equal(res.body.id, firstVariantID)
        done(err)
      })
  })

  it('Variant and it\'s images should be removed', (done) => {
    adminUser
      .get(`/product/${createdProductID}`)
      .expect(200)
      .end((err, res) => {
        assert.deepEqual(res.body.options, ['width', 'size', 'hover'])
        assert.equal(res.body.total_variants, 3)
        assert.equal(res.body.variants.length, 3)
        assert.equal(res.body.images.length, 4)
        done(err)
      })
  })
  // TODO refactor and complete test
  // Currently returns just the ID, should return the removed product
  it('should make removeProducts post adminUser', (done) => {
    adminUser
      .post('/product/removeProducts')
      .send([{
        id: createdProductID
      }])
      .expect(200)
      .end((err, res) => {
        // console.log('working on remove product',res.body)
        // assert.equal(res.body[0], createdProductID)
        done(err)
      })
  })
  it('It should not find the removed product', (done) => {
    adminUser
      .get(`/product/${createdProductID}`)
      .expect(404)
      .end((err, res) => {
        done(err)
      })
  })
  it('It should upload product_upload.csv', (done) => {
    adminUser
      .post('/product/uploadCSV')
      .attach('file', 'test/fixtures/product_upload.csv')
      .expect(200)
      .end((err, res) => {
        assert.ok(res.body.result.upload_id)
        uploadID = res.body.result.upload_id
        assert.equal(res.body.result.products, 18)
        assert.equal(res.body.result.errors.length, 1)
        done(err)
      })
  })
  it('It should process upload', (done) => {
    adminUser
      .post(`/product/processUpload/${uploadID}`)
      .send({})
      .expect(200)
      .end((err, res) => {
        assert.equal(res.body.products, 15)
        assert.equal(res.body.variants, 18)
        assert.equal(res.body.errors.length, 0)
        done(err)
      })
  })

  it('It should upload and update product_upload.csv', (done) => {
    adminUser
      .post('/product/uploadCSV')
      .attach('file', 'test/fixtures/product_upload.csv')
      .expect(200)
      .end((err, res) => {
        assert.ok(res.body.result.upload_id)
        uploadID = res.body.result.upload_id
        assert.equal(res.body.result.products, 18)
        assert.equal(res.body.result.errors.length, 1)
        done(err)
      })
  })
  it('It should process upload and update', (done) => {
    adminUser
      .post(`/product/processUpload/${uploadID}`)
      .send({})
      .expect(200)
      .end((err, res) => {
        assert.equal(res.body.products, 15)
        assert.equal(res.body.variants, 18)
        assert.equal(res.body.errors.length, 0)
        done(err)
      })
  })
  // TODO list associations
  it('It should get product with uploaded association', (done) => {
    adminUser
      .get('/product/handle/yeti')
      .expect(200)
      .end((err, res) => {
        done(err)
      })
  })

  it('It should upload product_meta_upload.csv', (done) => {
    adminUser
      .post('/product/uploadMetaCSV')
      .attach('file', 'test/fixtures/product_meta_upload.csv')
      .expect(200)
      .end((err, res) => {
        assert.ok(res.body.result.upload_id)
        uploadMetaID = res.body.result.upload_id
        assert.equal(res.body.result.products, 2)
        assert.equal(res.body.result.errors.length, 1)
        done(err)
      })
  })
  it('It should process meta upload', (done) => {
    adminUser
      .post(`/product/processMetaUpload/${uploadMetaID}`)
      .send({})
      .expect(200)
      .end((err, res) => {
        assert.equal(res.body.errors_count, 0)
        assert.equal(res.body.products, 2)
        done(err)
      })
  })
  it('It should get product with uploaded meta', (done) => {
    adminUser
      .get('/product/handle/hydroflask')
      .expect(200)
      .end((err, res) => {
        assert.equal(res.body.metadata['recycle'], 'no')
        assert.equal(res.body.metadata['material'], 'plastic')
        assert.equal(res.body.metadata['condition'], 'new')
        assert.equal(res.body.metadata['meta']['nested'], true)
        assert.equal(res.body.variants[0].metadata['material'], 'metal')
        assert.equal(res.body.variants[0].metadata['condition'], 'used')
        assert.equal(res.body.variants[0].metadata['recycle'], 'no')
        done(err)
      })
  })

  it('It should get products', (done) => {
    adminUser
      .get('/products')
      .expect(200)
      .end((err, res) => {
        assert.ok(res.headers['x-pagination-total'])
        assert.ok(res.headers['x-pagination-pages'])
        assert.ok(res.headers['x-pagination-page'])
        assert.ok(res.headers['x-pagination-limit'])
        assert.ok(res.headers['x-pagination-offset'])
        assert.ok(res.headers['x-pagination-sort'])

        assert.equal(_.isNumber(parseInt(res.headers['x-pagination-total'])), true)
        assert.equal(_.isNumber(parseInt(res.headers['x-pagination-offset'])), true)
        assert.equal(_.isNumber(parseInt(res.headers['x-pagination-limit'])), true)
        assert.equal(_.isNumber(parseInt(res.headers['x-pagination-page'])), true)
        assert.equal(_.isNumber(parseInt(res.headers['x-pagination-pages'])), true)

        // assert.equal(res.headers['x-pagination-total'], '21')
        // assert.equal(res.headers['x-pagination-pages'], '3')
        assert.equal(res.headers['x-pagination-page'], '1')
        assert.equal(res.headers['x-pagination-limit'], '10')
        assert.equal(res.headers['x-pagination-offset'], '0')
        assert.equal(res.headers['x-pagination-sort'], '[["created_at","DESC"]]')
        assert.ok(res.body)
        assert.equal(res.body.length, 10)
        done(err)
      })
  })
  it('It should get products offset', (done) => {
    adminUser
      .get('/products?offset=10')
      .expect(200)
      .end((err, res) => {
        assert.ok(res.headers['x-pagination-total'])
        assert.ok(res.headers['x-pagination-pages'])
        assert.ok(res.headers['x-pagination-page'])
        assert.ok(res.headers['x-pagination-limit'])
        assert.ok(res.headers['x-pagination-offset'])
        assert.ok(res.headers['x-pagination-sort'])

        assert.equal(_.isNumber(parseInt(res.headers['x-pagination-total'])), true)
        assert.equal(_.isNumber(parseInt(res.headers['x-pagination-offset'])), true)
        assert.equal(_.isNumber(parseInt(res.headers['x-pagination-limit'])), true)
        assert.equal(_.isNumber(parseInt(res.headers['x-pagination-page'])), true)
        assert.equal(_.isNumber(parseInt(res.headers['x-pagination-pages'])), true)

        // assert.equal(res.headers['x-pagination-total'], '21')
        // assert.equal(res.headers['x-pagination-pages'], '3')
        assert.equal(res.headers['x-pagination-page'], '2')
        assert.equal(res.headers['x-pagination-limit'], '10')
        assert.equal(res.headers['x-pagination-offset'], '10')
        assert.equal(res.headers['x-pagination-sort'], '[["created_at","DESC"]]')
        assert.ok(res.body)
        assert.equal(res.body.length, 10)
        done(err)
      })
  })
  it('It should get products by tag', (done) => {
    adminUser
      .get('/product/tag/flask')
      .expect(200)
      .end((err, res) => {
        assert.ok(res.body)
        assert.ok(res.headers['x-pagination-total'])
        assert.ok(res.headers['x-pagination-pages'])
        assert.ok(res.headers['x-pagination-page'])
        assert.ok(res.headers['x-pagination-limit'])

        assert.equal(_.isNumber(parseInt(res.headers['x-pagination-total'])), true)
        assert.equal(_.isNumber(parseInt(res.headers['x-pagination-offset'])), true)
        assert.equal(_.isNumber(parseInt(res.headers['x-pagination-limit'])), true)
        assert.equal(_.isNumber(parseInt(res.headers['x-pagination-page'])), true)
        assert.equal(_.isNumber(parseInt(res.headers['x-pagination-pages'])), true)

        assert.equal(res.headers['x-pagination-total'], '15')
        assert.equal(res.headers['x-pagination-pages'], '2')
        assert.equal(res.headers['x-pagination-page'], '1')
        assert.equal(res.headers['x-pagination-limit'], '10')
        assert.equal(res.headers['x-pagination-offset'], '0')
        assert.equal(res.body.length, 10)
        done(err)
      })
  })
  it('It should get products by tag offset', (done) => {
    adminUser
      .get('/product/tag/flask?offset=10')
      .expect(200)
      .end((err, res) => {
        assert.ok(res.body)
        assert.ok(res.headers['x-pagination-total'])
        assert.ok(res.headers['x-pagination-pages'])
        assert.ok(res.headers['x-pagination-page'])
        assert.ok(res.headers['x-pagination-limit'])

        assert.equal(_.isNumber(parseInt(res.headers['x-pagination-total'])), true)
        assert.equal(_.isNumber(parseInt(res.headers['x-pagination-offset'])), true)
        assert.equal(_.isNumber(parseInt(res.headers['x-pagination-limit'])), true)
        assert.equal(_.isNumber(parseInt(res.headers['x-pagination-page'])), true)
        assert.equal(_.isNumber(parseInt(res.headers['x-pagination-pages'])), true)

        assert.equal(res.headers['x-pagination-total'], '15')
        assert.equal(res.headers['x-pagination-pages'], '2')
        assert.equal(res.headers['x-pagination-page'], '2')
        assert.equal(res.headers['x-pagination-limit'], '10')
        assert.equal(res.headers['x-pagination-offset'], '10')
        assert.equal(res.body.length, 5)
        done(err)
      })
  })
  it('It should get products by collection', (done) => {
    adminUser
      .get('/product/collection/bottles')
      .expect(200)
      .end((err, res) => {
        // console.log('Products By Collection',res.body)
        assert.ok(res.body)
        assert.ok(res.headers['x-pagination-total'])
        assert.ok(res.headers['x-pagination-pages'])
        assert.ok(res.headers['x-pagination-page'])
        assert.ok(res.headers['x-pagination-limit'])
        assert.ok(res.headers['x-pagination-offset'])

        assert.equal(_.isNumber(parseInt(res.headers['x-pagination-total'])), true)
        assert.equal(_.isNumber(parseInt(res.headers['x-pagination-offset'])), true)
        assert.equal(_.isNumber(parseInt(res.headers['x-pagination-limit'])), true)
        assert.equal(_.isNumber(parseInt(res.headers['x-pagination-page'])), true)
        assert.equal(_.isNumber(parseInt(res.headers['x-pagination-pages'])), true)

        assert.equal(res.headers['x-pagination-total'], '15')
        assert.equal(res.headers['x-pagination-offset'], '0')
        assert.equal(res.headers['x-pagination-limit'], '10')
        assert.equal(res.headers['x-pagination-page'], '1')
        assert.equal(res.headers['x-pagination-pages'], '2')

        res.body.forEach(product => {
          let imagePos = 0
          product.images.forEach(image => {
            imagePos++
            assert.equal(image.position, imagePos)
          })
        })

        assert.equal(res.body.length, 10)
        done(err)
      })
  })
  it('It should get products by collection offset', (done) => {
    adminUser
      .get('/product/collection/bottles?offset=10')
      .expect(200)
      .end((err, res) => {
        assert.ok(res.body)
        assert.ok(res.headers['x-pagination-total'])
        assert.ok(res.headers['x-pagination-pages'])
        assert.ok(res.headers['x-pagination-page'])
        assert.ok(res.headers['x-pagination-limit'])
        assert.ok(res.headers['x-pagination-offset'])

        assert.equal(_.isNumber(parseInt(res.headers['x-pagination-total'])), true)
        assert.equal(_.isNumber(parseInt(res.headers['x-pagination-offset'])), true)
        assert.equal(_.isNumber(parseInt(res.headers['x-pagination-limit'])), true)
        assert.equal(_.isNumber(parseInt(res.headers['x-pagination-page'])), true)
        assert.equal(_.isNumber(parseInt(res.headers['x-pagination-pages'])), true)

        assert.equal(res.headers['x-pagination-total'], '15')
        assert.equal(res.headers['x-pagination-offset'], '10')
        assert.equal(res.headers['x-pagination-limit'], '10')
        assert.equal(res.headers['x-pagination-page'], '2')
        assert.equal(res.headers['x-pagination-pages'], '2')

        //let productPos = 0
        res.body.forEach(product => {
          let imagePos = 0
          product.images.forEach(image => {
            imagePos++
            assert.equal(image.position, imagePos)
          })
        })

        assert.equal(res.body.length, 5)
        done(err)
      })
  })
  it('It should search products by collection', (done) => {
    adminUser
      .get('/product/collection/bottles/search?term=hydro')
      .expect(200)
      .end((err, res) => {
        // console.log('SEARCHED', res.body)
        assert.ok(res.body)
        assert.ok(res.headers['x-pagination-total'])
        assert.ok(res.headers['x-pagination-pages'])
        assert.ok(res.headers['x-pagination-page'])
        assert.ok(res.headers['x-pagination-limit'])
        assert.ok(res.headers['x-pagination-offset'])

        assert.equal(_.isNumber(parseInt(res.headers['x-pagination-total'])), true)
        assert.equal(_.isNumber(parseInt(res.headers['x-pagination-offset'])), true)
        assert.equal(_.isNumber(parseInt(res.headers['x-pagination-limit'])), true)
        assert.equal(_.isNumber(parseInt(res.headers['x-pagination-page'])), true)
        assert.equal(_.isNumber(parseInt(res.headers['x-pagination-pages'])), true)

        assert.equal(res.headers['x-pagination-total'], '1')
        assert.equal(res.headers['x-pagination-offset'], '0')
        assert.equal(res.headers['x-pagination-limit'], '10')
        assert.equal(res.headers['x-pagination-page'], '1')
        assert.equal(res.headers['x-pagination-pages'], '1')

        // console.log('WORKING HERE', res.body[0])
        res.body.forEach(product => {
          assert.equal(product.images.length, 2)
          // let variantPos = 0
          let imagePos = 0
          product.images.forEach(image => {
            imagePos++
            assert.equal(image.position, imagePos)
          })
          // NOTE: Variants are not included in this request
          // product.variants.forEach(variant => {
          //   variantPos++
          //   assert.equal(variant.position, variantPos)
          // })
        })

        assert.equal(res.body.length, 1)
        done(err)
      })
  })
  it.skip('It should get product by handle', (done) => {
    adminUser
      .get('/product/discount-test')
      .expect(200)
      .end((err, res) => {
        assert.ok(res.body)
        assert.equal(res.body.handle, 'discount-test')
        done(err)
      })
  })
  it('It should get product by handle alias', (done) => {
    adminUser
      .get('/product/handle/discount-test')
      .expect(200)
      .end((err, res) => {
        assert.ok(res.body)
        assert.equal(res.body.handle, 'discount-test')
        done(err)
      })
  })
  it('It should search and get product', (done) => {
    adminUser
      .get('/products/search?term=Hydro')
      .expect(200)
      .end((err, res) => {
        assert.ok(res.headers['x-pagination-total'])
        assert.ok(res.headers['x-pagination-pages'])
        assert.ok(res.headers['x-pagination-page'])
        assert.ok(res.headers['x-pagination-limit'])
        assert.ok(res.headers['x-pagination-offset'])
        assert.ok(res.headers['x-pagination-sort'])

        assert.equal(_.isNumber(parseInt(res.headers['x-pagination-total'])), true)
        assert.equal(_.isNumber(parseInt(res.headers['x-pagination-offset'])), true)
        assert.equal(_.isNumber(parseInt(res.headers['x-pagination-limit'])), true)
        assert.equal(_.isNumber(parseInt(res.headers['x-pagination-page'])), true)
        assert.equal(_.isNumber(parseInt(res.headers['x-pagination-pages'])), true)

        assert.equal(res.headers['x-pagination-total'], '1')
        assert.equal(res.headers['x-pagination-offset'], '0')
        assert.equal(res.headers['x-pagination-limit'], '10')
        assert.equal(res.headers['x-pagination-page'], '1')
        assert.equal(res.headers['x-pagination-pages'], '1')

        res.body.forEach(product => {
          let imagePos = 0
          product.images.forEach(image => {
            imagePos++
            assert.equal(image.position, imagePos)
          })
        })

        assert.equal(res.body.length, 1)
        done(err)
      })
  })

  it('should make a minimal add product post adminUser', (done) => {
    adminUser
      .post('/product')
      .send(
        {
          handle: 'rei-bag',
          title: 'REI Bag',
          body: 'REI Bag',
          vendors: [
            'REI'
          ],
          type: 'REI Bag',
          price: '10000',
          published: true,
          tags: [
            'equipment',
            'outdoor'
          ],
          sku: 'rei-123',
          option: { capacity: '28 grams' },
          weight: 1,
          weight_unit: 'lb'
        }
      )
      .expect(200)
      .end((err, res) => {
        // Product
        assert.ok(res.body.id)
        createdProductID = res.body.id
        assert.equal(res.body.handle, 'rei-bag')
        assert.equal(res.body.title, 'REI Bag')
        assert.equal(res.body.seo_title, 'REI Bag')
        assert.equal(res.body.seo_description, 'REI Bag')
        assert.notEqual(res.body.vendors.indexOf('REI'), -1)
        assert.equal(res.body.type, 'REI Bag')
        assert.notEqual(res.body.options.indexOf('capacity'), -1)
        // Tags
        assert.equal(res.body.tags.length, 2)
        assert.notEqual(res.body.tags.indexOf('equipment'), -1)
        assert.notEqual(res.body.tags.indexOf('outdoor'), -1)

        // Variants
        assert.equal(res.body.variants.length, 1)
        assert.equal(res.body.variants[0].position, 1)

        assert.equal(res.body.variants[0].product_id, res.body.id)
        assert.equal(res.body.variants[0].sku, 'rei-123')
        assert.equal(res.body.variants[0].title, res.body.title)
        assert.equal(res.body.variants[0].price, res.body.price)
        assert.equal(res.body.variants[0].weight, res.body.weight)
        assert.equal(res.body.variants[0].weight_unit, res.body.weight_unit)
        assert.equal(res.body.variants[0].option.capacity, '28 grams')
        done(err)
      })
  })

  it('should make a minimal update product post adminUser', (done) => {
    adminUser
      .put(`/product/${createdProductID}`)
      .send(
        {
          handle: 'rei-bag',
          title: 'REI Bag',
          body: 'REI Bag',
          vendors: [
            'REI'
          ],
          type: 'REI Bag',
          price: '10000',
          published: true,
          tags: [
            'equipment',
            'outdoor'
          ],
          sku: 'rei-123',
          option: { capacity: '28 grams' },
          weight: 1,
          weight_unit: 'lb'
        }
      )
      .expect(200)
      .end((err, res) => {
        // Product
        assert.ok(res.body.id)
        createdProductID = res.body.id
        assert.equal(res.body.handle, 'rei-bag')
        assert.equal(res.body.title, 'REI Bag')
        assert.equal(res.body.seo_title, 'REI Bag')
        assert.equal(res.body.seo_description, 'REI Bag')
        assert.notEqual(res.body.vendors.indexOf('REI'), -1)
        assert.equal(res.body.type, 'REI Bag')
        assert.notEqual(res.body.options.indexOf('capacity'), -1)
        // Tags
        assert.equal(res.body.tags.length, 2)
        assert.notEqual(res.body.tags.indexOf('equipment'), -1)
        assert.notEqual(res.body.tags.indexOf('outdoor'), -1)

        // Variants
        assert.equal(res.body.variants.length, 1)
        assert.equal(res.body.variants[0].position, 1)

        assert.equal(res.body.variants[0].product_id, res.body.id)
        assert.equal(res.body.variants[0].sku, 'rei-123')
        assert.equal(res.body.variants[0].title, res.body.title)
        assert.equal(res.body.variants[0].price, res.body.price)
        assert.equal(res.body.variants[0].weight, res.body.weight)
        assert.equal(res.body.variants[0].weight_unit, res.body.weight_unit)
        assert.equal(res.body.variants[0].option.capacity, '28 grams')
        done(err)
      })
  })


  // it('It should upload a real world realworld_upload.csv', (done) => {
  //   adminUser
  //     .post('/product/uploadCSV')
  //     .attach('file', 'test/fixtures/realworld_upload.csv')
  //     .expect(200)
  //     .end((err, res) => {
  //       assert.ok(res.body.result.upload_id)
  //       uploadID = res.body.result.upload_id
  //       assert.equal(res.body.result.products, 818)
  //       assert.equal(res.body.result.errors.length, 0)
  //       done(err)
  //     })
  // })
  //
  // it('It should process real world upload', (done) => {
  //   adminUser
  //     .post(`/product/processUpload/${uploadID}`)
  //     .send({})
  //     .expect(200)
  //     .end((err, res) => {
  //       assert.equal(res.body.products, 41)
  //       assert.equal(res.body.variants, 1034)
  //       assert.equal(res.body.errors.length, 0)
  //       done(err)
  //     })
  // })
  //
  // it('It should upload a real world realworld_upload.csv again', (done) => {
  //   adminUser
  //     .post('/product/uploadCSV')
  //     .attach('file', 'test/fixtures/realworld_upload.csv')
  //     .expect(200)
  //     .end((err, res) => {
  //       assert.ok(res.body.result.upload_id)
  //       uploadID = res.body.result.upload_id
  //       assert.equal(res.body.result.products, 818)
  //       assert.equal(res.body.result.errors.length, 0)
  //       done(err)
  //     })
  // })
  //
  // it('It should process real world upload again', (done) => {
  //   adminUser
  //     .post(`/product/processUpload/${uploadID}`)
  //     .send({})
  //     .expect(200)
  //     .end((err, res) => {
  //       assert.equal(res.body.products, 41)
  //       assert.equal(res.body.variants, 1034)
  //       assert.equal(res.body.errors.length, 0)
  //       done(err)
  //     })
  // })

})
