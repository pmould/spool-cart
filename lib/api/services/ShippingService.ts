import { FabrixService as Service } from '@fabrix/fabrix/dist/common'

/**
 * @module ShippingService
 * @description Shipping Service
 */
export class ShippingService extends Service {
  publish(type, event, options: {save?: boolean, transaction?: any, include?: any} = {}) {
    if (this.app.services.EventsService) {
      options.include = options.include ||  [{
        model: this.app.models.EventItem.instance,
        as: 'objects'
      }]
      return this.app.services.EventsService.publish(type, event, options)
    }
    this.app.log.debug('spool-events is not installed, please install it to use publish')
    return Promise.resolve()
  }

  calculate(obj, lineItems, shippingAddress, resolver, options) {
    options = options || {}
    let resObj
    return resolver.resolve(obj, {transaction: options.transaction || null})
      .then(_obj => {
        if (!_obj) {
          throw new Error('Could not resolve for shipping')
        }
        resObj = _obj
        return this.app.services.ProxyCartService.resolveItemsFromTo(resObj, lineItems.filter(i => i.requires_shipping), shippingAddress)
      })
      .then(resolvedItemsFromTo => {
        if (!resolvedItemsFromTo) {
          return resObj
        }
        return this.getShipping(resObj, lineItems, resolvedItemsFromTo, options)
      })
      .then(shippingResult => {
        return shippingResult
      })
  }

  getShipping(obj, lineItems, resolvedItemsFromTo, options) {
    options = options || {}
    // const shippingProvider = this.app.config.generics[obj.shipping_provider]
    //   || this.app.config.get('generics.shipping_provider')

    return Promise.resolve({
      line_items: []
    })
    // return this.app.services.TaxGenericService.taxForOrder({
    //   nexus_addresses: resolvedItemsFromTo.nexus_addresses,
    //   to_address: resolvedItemsFromTo.to_address,
    //   line_items: lineItems,
    //   subtotal_price: obj.subtotal_price,
    //   total_shipping: obj.total_shipping
    // }, taxProvider)
  }
}

