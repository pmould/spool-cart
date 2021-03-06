'use strict'
/* global describe, it */
const assert = require('assert')

describe('Account Model', () => {
  let Account
  it('should exist', () => {
    assert(global.app.api.services['AccountService'])
    Account = global.app.models['Account']
    assert(Account)
  })
  it('should resolve a account instance', (done) => {
    Account.resolve(Account.build({}))
      .then(account => {
        assert.ok(account instanceof Account.instance)
        done()
      })
      .catch(err => {
        done(err)
      })
  })
})
