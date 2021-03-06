'use strict'
/* global describe, it */
const assert = require('assert')

describe('Customer Model', () => {
  let Customer
  it('should exist', () => {
    assert(global.app.api.models['Customer'])
    Customer = global.app.models['Customer']
  })
  it('should resolve a customer instance', (done) => {
    Customer.resolve(Customer.build({}))
      .then(customer => {
        assert.ok(customer instanceof Customer.instance)
        done()
      })
      .catch(err => {
        done(err)
      })
  })
})
