import { FabrixService as Service } from '@fabrix/fabrix/dist/common'
import { ModelError } from '@fabrix/spool-sequelize/dist/errors'
import * as _ from 'lodash'
import { PAYMENT_PROCESSING_METHOD } from '../../enums'
import { FULFILLMENT_STATUS } from '../../enums'
import { ORDER_STATUS } from '../../enums'
import { ORDER_FULFILLMENT } from '../../enums'
// import { PAYMENT_KIND } from '../../enums'
// import { orders.fulfillment_kind } from '../../enums'
import { TRANSACTION_STATUS } from '../../enums'
import { TRANSACTION_KIND } from '../../enums'
import { ORDER_FINANCIAL } from '../../enums'
import { ORDER_CANCEL } from '../../enums'
/**
 * @module OrderService
 * @description Order Service
 */
export class OrderService extends Service {
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
  /**
   * Creates an Order
   */
  // TODO Select Vendor if not selected per order_item
  // TODO handle inventory policy and coupon policy on fulfillments
  create(obj, options: {[key: string]: any} = {}) {
    const Address = this.app.models['Address']
    const Customer = this.app.models['Customer']
    const Order = this.app.models['Order']
    const OrderItem = this.app.models['OrderItem']
    // const Transaction = this.app.models['Transaction']
    // const Fulfillment = this.app.models['Fulfillment']
    // const PaymentService = this.app.services.PaymentService

    // Set the initial total amount due for this order
    let totalDue = obj.total_due
    let totalPrice = obj.total_price
    let totalOverrides = 0
    let deduction = 0
    let resOrder: {[key: string]: any} = {}
    let resCustomer: {[key: string]: any} = {}
    let resBillingAddress: {[key: string]: any} = {}
    let resShippingAddress: {[key: string]: any} = {}

    // Validate obj cart
    if (!obj.cart_token && !obj.subscription_token) {
      const err = new ModelError('E_NOT_FOUND', 'Missing a Cart token or a Subscription token')
      return Promise.reject(err)
    }
    // Validate payment details
    if (!obj.payment_details) {
      const err = new ModelError('E_NOT_FOUND', 'Missing Payment Details')
      return Promise.reject(err)
    }

    // Reconcile some shipping if one of the values is missing
    if (obj.shipping_address && !obj.billing_address) {
      obj.billing_address = obj.shipping_address
    }
    if (!obj.shipping_address && obj.billing_address) {
      obj.shipping_address = obj.billing_address
    }

    // return Order.datastore.transaction(t => {
    return Customer.resolve(obj.customer_id || obj.customer, {
      include: [
        {
          model: Address.instance,
          as: 'shipping_address'
        },
        {
          model: Address.instance,
          as: 'billing_address'
        },
        {
          model: Address.instance,
          as: 'default_address'
        }
      ]
    })
        .then(customer => {
          // The customer exists, has a default address, but no shipping address
          if (customer && customer.default_address && !customer.shipping_address) {
            customer.shipping_address = customer.default_address
          }
          // The customer exists, has a default address, but no billing address
          if (customer && customer.default_address && !customer.billing_address) {
            customer.billing_address = customer.default_address
          }
          // The customer exist, the order requires shipping, but no shipping information
          if (customer && !customer.shipping_address && !obj.shipping_address && obj.has_shipping) {
            throw new ModelError('E_NOT_FOUND', `Could not find customer shipping address for id '${obj.customer_id}'`)
          }
          // The customer exist, the order requires shipping, but no billing information
          if (customer && !customer.billing_address && !obj.billing_address && obj.has_shipping) {
            throw new ModelError('E_NOT_FOUND', `Could not find customer billing address for id '${obj.customer_id}'`)
          }
          // Set a blank customer object if there isn't one for this order
          if (!customer) {
            resCustomer = {
              id: null,
              email: null,
              account_balance: 0,
              billing_address: null,
              shipping_address: null
            }
          }
          // Return this resolved customer
          else {
            resCustomer = customer
          }
          // Resolve the Billing Address
          resBillingAddress = this.resolveToAddress(resCustomer.billing_address, obj.billing_address)
          // Resolve the Shipping Address
          resShippingAddress = this.resolveToAddress(resCustomer.shipping_address, obj.shipping_address)

          if (!resShippingAddress && obj.has_shipping) {
            throw new Error('Order does not have a valid shipping address')
          }

          // If not payment_details, make blank array
          if (!obj.payment_details) {
            obj.payment_details = []
          }
          // If not pricing_overrides, make blank array
          if (!obj.pricing_overrides) {
            obj.pricing_overrides = []
          }
          // Map the gateway names being used
          const paymentGatewayNames = obj.payment_details.map(detail => { return detail.gateway })
          const accountBalanceIndex = _.findIndex(obj.pricing_overrides, {name: 'Account Balance'})
          // Account balance has been applied, check to update it.
          if (accountBalanceIndex > -1) {
            const prevPrice = obj.pricing_overrides[accountBalanceIndex].price
            // If account balance is present, revert it so it can be added back in with current.
            totalDue = totalDue + prevPrice
            totalPrice = totalPrice + prevPrice
          }
          // Add the account balance to the overrides
          if (resCustomer.account_balance > 0) {
            const exclusions = obj.line_items.filter(item => {
              item.exclude_payment_types = item.exclude_payment_types || []
              return item.exclude_payment_types.indexOf('Account Balance') !== -1
            })
            const removeTotal = _.sumBy(exclusions, (e: {[key: string]: any}) => e.calculated_price)
            const deductibleTotal = Math.max(0, totalDue - removeTotal)
            // Apply Customer Account balance
            deduction = Math.min(deductibleTotal, (deductibleTotal - (deductibleTotal - resCustomer.account_balance)))
            if (deduction > 0) {
              // If account balance has not been applied
              if (accountBalanceIndex === -1) {
                obj.pricing_overrides.push({
                  name: 'Account Balance',
                  price: deduction
                })
                totalDue = Math.max(0, totalDue - deduction)
                totalPrice = Math.max(0, totalPrice - deduction)
              }
              // Otherwise update the account balance
              else {
                // const prevPrice = obj.pricing_overrides[accountBalanceIndex].price
                obj.pricing_overrides[accountBalanceIndex].price = deduction
                totalDue = Math.max(0, totalDue - deduction)
                totalPrice = Math.max(0, totalPrice - deduction)
              }
              // Recalculate Overrides
              _.each(obj.pricing_overrides, override => {
                totalOverrides = totalOverrides + override.price
              })
              obj.total_overrides = totalOverrides
            }
          }
          else {
            if (accountBalanceIndex > -1) {
              const prevPrice = obj.pricing_overrides[accountBalanceIndex].price
              obj.pricing_overrides = obj.pricing_overrides.splice(accountBalanceIndex, 1)
              totalDue = Math.max(0, totalDue + prevPrice)
              totalPrice = Math.max(0, totalPrice + prevPrice)
            }
          }

          // obj.line_items = obj.line_items.map(item => {
          //   return OrderItem.build(item)
          // })

          // Create the blank fulfillments
          const fulfillmentsGroups = _.groupBy(obj.line_items, 'fulfillment_service')
          // Map into array
          const fulfillments = _.map(fulfillmentsGroups, (items, service) => {
            // return Fulfillment.build({
            return {
              service: service,
              total_items: items.length,
              total_pending_fulfillments: items.length
            }
            // })
          })

          // Make sure all order items are given the customer id
          const lineItems = obj.line_items.map(item => {
            item.customer_id = resCustomer.id || null
            // item.shop_id =  null
            return item
          })

          return Order.create({
          // const order = Order.build({
            // Order Info
            processing_method: obj.processing_method || PAYMENT_PROCESSING_METHOD.DIRECT,
            processed_at: new Date(),

            // Cart/Subscription Info
            cart_token: obj.cart_token,
            subscription_token: obj.subscription_token,
            currency: obj.currency,
            order_items: lineItems,
            tax_lines: obj.tax_lines,
            shipping_lines: obj.shipping_lines,
            discounted_lines: obj.discounted_lines,
            coupon_lines: obj.coupon_lines,
            subtotal_price: obj.subtotal_price,
            taxes_included: obj.taxes_included,
            total_discounts: obj.total_discounts,
            total_coupons: obj.total_coupons,
            total_line_items_price: obj.total_line_items_price,
            total_price: totalPrice,
            total_due: totalDue,
            total_tax: obj.total_tax,
            total_shipping: obj.total_shipping,
            total_weight: obj.total_weight,
            total_items: obj.total_items,
            shop_id: obj.shop_id || null,
            has_shipping: obj.has_shipping,
            has_taxes: obj.has_taxes,
            has_subscription: obj.has_subscription,
            email: obj.email || resCustomer.email || null,
            phone: obj.phone || resCustomer.phone || null,

            // Types
            fulfillment_kind: obj.fulfillment_kind || this.app.config.get('cart.orders.fulfillment_kind'),
            payment_kind: obj.payment_kind || this.app.config.get('cart.orders.payment_kind'),
            transaction_kind: obj.transaction_kind
              || this.app.config.get('cart.orders.transaction_kind')
              || TRANSACTION_KIND.AUTHORIZE,
            // Gateway
            payment_gateway_names: paymentGatewayNames,

            // Client Info
            client_details: obj.client_details,
            ip: obj.ip,

            // Customer Info
            customer_id: resCustomer.id, // (May Be Null)
            buyer_accepts_marketing: resCustomer.accepts_marketing || obj.buyer_accepts_marketing,
            billing_address: resBillingAddress,
            shipping_address: resShippingAddress,

            // User Info
            user_id: obj.user_id || null,

            // Overrides
            pricing_override_id: obj.pricing_override_id || null,
            pricing_overrides: obj.pricing_overrides || [],
            total_overrides: obj.total_overrides || 0,

            // Notes
            notes: obj.notes || null,

            // Fulfillments
            fulfillments: fulfillments,
            total_pending_fulfillments: fulfillments.length,
            shops: lineItems.map(item => item.shop_id).filter(n => n)
          }, {
            include: [
              // {
              //   model: this.app.models['Customer'].instance
              // },
              {
                model: OrderItem.instance,
                as: 'order_items'
              },
              {
                model: this.app.models['Fulfillment'].instance,
                as: 'fulfillments',
                include: [
                  {
                    model: OrderItem.instance,
                    as: 'order_items'
                  }
                ]
              },
              {
                model: this.app.models['Transaction'].instance,
                as: 'transactions'
              },
            ],
            transaction: options.transaction || null
          })

          // order.set('order_items', lineItems)
          //
          // return order.save({transaction: options.transaction || null})
        })
        .then(_order => {
          if (!_order) {
            throw new Error('Unexpected Error while creating order')
          }
          resOrder = _order

          if (resCustomer instanceof Customer.instance && deduction > 0) {
            return resCustomer.logAccountBalance(
              'debit',
              deduction,
              resOrder.currency,
              null,
              resOrder.id,
              {transaction: options.transaction || null}
            )
          }
          else {
            return
          }
        })
        .then(() => {
          // TODO, most of this should be aggregated by cron or run time
          if (resCustomer instanceof Customer.instance) {
            return resCustomer
              .setTotalSpent(totalPrice)
              .setLastOrder(resOrder)
              .setTotalOrders()
              .setAvgSpent()
              .save({transaction: options.transaction || null})
          }
          else {
            return
          }
        })
        .then(() => {
          // Group fulfillment by service
          return resOrder.groupFulfillments({transaction: options.transaction || null})
        })
        .then(() => {
          // Group Transactions by Payment Gateway
          return resOrder.groupTransactions(obj.payment_details, {transaction: options.transaction || null})
        })
        .then(() => {
          // Reload to the freshest copy after all the events
          return resOrder.reload({transaction: options.transaction || null})
        })
        .then(() => {
          // Save the status changes
          return resOrder.saveStatus({transaction: options.transaction || null})
        })
        .then(() => {
          if (resOrder.discounted_lines.length > 0) {
            return resOrder.logDiscountUsage({transaction: options.transaction || null})
          }
          else {
            return
          }
        })
        .then(() => {
          // TODO REMOVE THIS PART WHEN WE CREATE THE EVENT ELSEWHERE
          if (resCustomer instanceof Customer.instance) {
            return resCustomer.addOrder(resOrder.id, { transaction: options.transaction || null})
              .then(() => {
                const event = {
                  object_id: resCustomer.id,
                  object: 'customer',
                  objects: [{
                    customer: resCustomer.id
                  }, {
                    order: resOrder.id
                  }],
                  type: 'customer.order.created',
                  message: `Customer ${ resCustomer.email || 'ID ' + resCustomer.id } Order ${ resOrder.name } was created`,
                  data: resOrder
                }
                return this.publish(event.type, event, {
                  save: true,
                  transaction: options.transaction || null
                })
              })
          }
          else {
            return
          }
        })
        .then(() => {
          // Load default
          return Order.findByIdDefault(resOrder.id, {transaction: options.transaction || null})
        })
    // })
  }

  /**
   *
   * @param order
   * @param options
   * @returns {Promise.<T>}
   */
  update(order, options) {
    options = options || {}
    const Order = this.app.models.Order
    let resOrder
    return Order.resolve(order, options)
      .then(_order => {
        if (!_order) {
          throw new Error('Order not found')
        }
        resOrder = _order
        if (
          [FULFILLMENT_STATUS.PENDING, FULFILLMENT_STATUS.NONE, FULFILLMENT_STATUS.SENT]
            .indexOf(resOrder.fulfillment_status) === -1 || resOrder.cancelled_at
        ) {
          throw new Error(`${order.name} can not be updated as it is already being fulfilled`)
        }

        if (order.billing_address) {
          resOrder.billing_address = _.extend(resOrder.billing_address, order.billing_address)
          resOrder.billing_address = this.app.services.ProxyCartService.validateAddress(resOrder.billing_address)
          return this.app.services.GeolocationGenericService.locate(resOrder.billing_address)
            .then(latLng => {
              resOrder.billing_address = _.defaults(resOrder.billing_address, latLng)
              return
            })
            .catch(err => {
              return
            })
        }
        return
      })
      .then(() => {
        if (order.shipping_address) {
          resOrder.shipping_address = _.extend(resOrder.shipping_address, order.shipping_address)
          resOrder.shipping_address = this.app.services.ProxyCartService.validateAddress(resOrder.shipping_address)
          return this.app.services.GeolocationGenericService.locate(resOrder.shipping_address)
            .then(latLng => {
              resOrder.shipping_address = _.defaults(resOrder.shipping_address, latLng)
              return
            })
            .catch(err => {
              return
            })
        }
        return
      })
      .then(() => {
        if (order.buyer_accepts_marketing) {
          resOrder.buyer_accepts_marketing = order.buyer_accepts_marketing
        }
        if (order.email) {
          resOrder.email = order.email
        }
        if (order.phone) {
          resOrder.phone = order.phone
        }
        if (order.note) {
          resOrder.note = order.note
        }
        // return resOrder.save({transaction: options.transaction || null})
        return resOrder.recalculate({transaction: options.transaction || null})
      })
      .then(() => {
        return resOrder.sendUpdatedEmail({transaction: options.transaction || null})
      })
      .then(() => {
        return Order.findByIdDefault(resOrder.id)
      })
  }

  /**
   * Pay an item
   * @param order
   * @param paymentDetails
   * @param options
   * @returns {*|Promise.<T>}
   */
  // TODO handle payment of remaining balance if provided
  pay(order, paymentDetails, options: {[key: string]: any} = {}) {
    const Order = this.app.models['Order']
    const Sequelize = Order.sequelize

    // Make sure order_items is in includes
    options.includes = options.includes || []
    if (!options.includes.some(include => include.model === this.app.models['OrderItem'].instance)) {
      options.includes.push({
        model: this.app.models['OrderItem'].instance,
        as: 'order_items'
      })
    }

    if (!options.includes.some(include => include.model === this.app.models['Fulfillment'].instance)) {
      options.includes.push({
        model: this.app.models['Fulfillment'].instance,
        as: 'fulfillments'
      })
    }

    if (!options.includes.some(include => include.model === this.app.models['Transaction'].instance)) {
      options.includes.push({
        model: this.app.models['Transaction'].instance,
        as: 'transactions'
      })
    }

    if (!options.includes.some(include => include.model === this.app.models['Refund'].instance)) {
      options.includes.push({
        model: this.app.models['Refund'].instance,
        as: 'refunds'
      })
    }

    let resOrder
    return Order.resolve(order, options)
      .then(_order => {
        if (!_order) {
          throw new ModelError('E_NOT_FOUND', 'Order not found')
        }

        if (_order.financial_status !== (ORDER_FINANCIAL.AUTHORIZED || ORDER_FINANCIAL.PARTIALLY_PAID)) {
          // tslint:disable:max-line-length
          throw new Error(`Order status is ${_order.financial_status} not '${ORDER_FINANCIAL.AUTHORIZED} or ${ORDER_FINANCIAL.PARTIALLY_PAID}'`)
        }

        resOrder = _order
        return resOrder.resolveTransactions({transaction: options.transaction || null})
      })
      .then(() => {
        const authorized = resOrder.transactions.filter(transaction => transaction.kind === TRANSACTION_KIND.AUTHORIZE)
        return Sequelize.Promise.mapSeries(authorized, transaction => {
          return this.app.services.TransactionService.capture(transaction, {transaction: options.transaction || null})
        })
      })
      .then(() => {
        const event = {
          object_id: resOrder.id,
          object: 'order',
          objects: [{
            customer: resOrder.customer_id
          }, {
            order: resOrder.id
          }],
          type: `order.${resOrder.financial_status}`,
          message: `Order ${ resOrder.name } was ${resOrder.financial_status}`,
          data: resOrder
        }
        return this.publish(event.type, event, {
          save: true,
          transaction: options.transaction || null
        })
      })
      .then((event) => {
        if (resOrder.financial_status === ORDER_FINANCIAL.PAID && resOrder.customer_id) {
          return resOrder.sendPaidEmail({transaciton: options.transaction || null })
        }
        else {
          return
        }
      })
      .then((notifications) => {
        return this.app.models['Order'].findByIdDefault(resOrder.id, {transaction: options.transaction || null})
      })
  }
  /**
   * Pay multiple orders
   * @param orders
   * @param options
   * @returns {Promise.<*>}
   */
  payOrders(orders, options: {[key: string]: any} = {}) {
    const Sequelize = this.app.models['Order'].sequelize
    return Sequelize.Promise.mapSeries(orders, order => {
      return this.pay(order, order.payment_details, {transaction: options.transaction || null})
    })
  }

  /**
   *
   * @param orderItem
   * @param options
   * @returns {Promise.<TResult>}
   */
  refundOrderItem(orderItem, options: {[key: string]: any} = {}) {
    const OrderItem = this.app.models['OrderItem']
    const Order = this.app.models['Order']
    const Refund = this.app.models['Refund']

    let resOrderItem, resOrder
    return OrderItem.resolve(orderItem, {transaction: options.transaction || null})
      .then(_orderItem => {
        if (!_orderItem) {
          throw new ModelError('E_NOT_FOUND', 'OrderItem not found')
        }
        resOrderItem = _orderItem
        return resOrderItem
      })
      .then(() => {
        return resOrderItem.getOrder({transaction: options.transaction || null})
      })
      .then(order => {
        if (!order) {
          throw new ModelError('E_NOT_FOUND', 'Order not found')
        }
        const allowedStatuses = [
          ORDER_FINANCIAL.PAID,
          ORDER_FINANCIAL.PARTIALLY_PAID,
          ORDER_FINANCIAL.PARTIALLY_REFUNDED
        ]

        if (allowedStatuses.indexOf(order.financial_status) === -1) {
          // tslint:disable:max-line-length
          throw new Error(`Order status is ${ order.financial_status } not '${ORDER_FINANCIAL.PAID}, ${ORDER_FINANCIAL.PARTIALLY_PAID}' or '${ORDER_FINANCIAL.PARTIALLY_REFUNDED}'`)
        }
        // Bind DAO
        resOrder = order
        // Resolve transactions in case they aren't added yet
        return resOrder.resolveTransactions({transaction: options.transaction || null})
      })
      .then(() => {

        const canRefund = resOrder.transactions.filter(transaction => {
          return [TRANSACTION_KIND.SALE, TRANSACTION_KIND.CAPTURE].indexOf(transaction.kind) > -1
        })
        // TODO, refund multiple transactions is necessary
        const toRefund = canRefund.find(transaction => transaction.amount >= resOrderItem.calculated_price)
        if (!toRefund) {
          // TODO CREATE PROPER ERROR
          throw new Error('No transaction available to refund this item\'s calculated price')
        }
        return this.app.services.TransactionService.partiallyRefund(
          toRefund,
          resOrderItem.calculated_price,
          {transaction: options.transaction || null}
        )
      })
      .then(transaction => {
        if (transaction.kind === TRANSACTION_KIND.REFUND && transaction.status === TRANSACTION_STATUS.SUCCESS) {
          return Refund.create({
            order_id: resOrder.id,
            transaction_id: transaction.id,
            amount: transaction.amount,
            restock: options.restock || null
          }, {
            transaction: options.transaction || null
          })
        }
        else {
          throw new Error('Was unable to refund this transaction')
        }
      })
      .then(refund => {
        return resOrderItem.setRefund(refund.id, {transaction: options.transaction || null})
      })
      .then(newRefund => {
        // Resolve the refunds now that it's been added
        return resOrder.resolveRefunds({transaction: options.transaction || null})
      })
      .then(() => {
        return resOrder.saveFinancialStatus({transaction: options.transaction || null})
      })
      .then(order => {
        return Order.findByIdDefault(resOrder.id)
      })
  }
  /**
   * Refund an Order or Partially Refund an Order
   * @param order
   * @param refunds
   * @param options
   * @returns {*|Promise.<TResult>}
   */
  // TODO restock
  refund(order, refunds = [], options: {[key: string]: any} = {}) {
    const Order = this.app.models['Order']
    const Sequelize = Order.sequelize

    // Make sure order_items is in includes
    options.includes = options.includes || []
    if (!options.includes.some(include => include.model === this.app.models['OrderItem'].instance)) {
      options.includes.push({
        model: this.app.models['OrderItem'].instance,
        as: 'order_items'
      })
    }

    if (!options.includes.some(include => include.model === this.app.models['Fulfillment'].instance)) {
      options.includes.push({
        model: this.app.models['Fulfillment'].instance,
        as: 'fulfillments'
      })
    }

    if (!options.includes.some(include => include.model === this.app.models['Transaction'].instance)) {
      options.includes.push({
        model: this.app.models['Transaction'].instance,
        as: 'transactions'
      })
    }

    if (!options.includes.some(include => include.model === this.app.models['Refund'].instance)) {
      options.includes.push({
        model: this.app.models['Refund'].instance,
        as: 'refunds'
      })
    }

    let resOrder
    return Order.resolve(order, options)
      .then(_order => {
        if (!_order) {
          throw new ModelError('E_NOT_FOUND', 'Order not found')
        }
        const allowedStatuses = [ORDER_FINANCIAL.PAID, ORDER_FINANCIAL.PARTIALLY_PAID, ORDER_FINANCIAL.PARTIALLY_REFUNDED]
        if (allowedStatuses.indexOf(_order.financial_status) === -1) {
          // tslint:disable:max-line-length
          throw new Error(`Order status is ${ _order.financial_status } not '${ORDER_FINANCIAL.PAID}, ${ORDER_FINANCIAL.PARTIALLY_PAID}' or '${ORDER_FINANCIAL.PARTIALLY_REFUNDED}'`)
        }
        return _order
      })
      .then(_order => {
        resOrder = _order
        return resOrder.resolveTransactions({transaction: options.transaction || null})
      })
      .then(() => {
        return resOrder.resolveRefunds({transaction: options.transaction || null})
      })
      .then(() => {
        // Partially Refund because refunds was sent to method
        if (refunds.length > 0) {
          return Sequelize.Promise.mapSeries(refunds, refund => {
            const refundTransaction = resOrder.transactions.find(transaction => transaction.id === refund.transaction)
            if (
              [TRANSACTION_KIND.SALE, TRANSACTION_KIND.CAPTURE].indexOf(refundTransaction.kind) > -1
              && refundTransaction.status === TRANSACTION_STATUS.SUCCESS
            ) {
              // If this is a full Transaction refund
              if (refund.amount === refundTransaction.amount) {
                return this.app.services.TransactionService
                  .refund(refundTransaction, { transaction: options.transaction || null })
              }
              // If this is a partial refund
              else {
                return this.app.services.TransactionService
                  .partiallyRefund(refundTransaction, refund.amount, { transaction: options.transaction || null })
              }
            }
          })
        }
        // Completely Refund the order
        else {
          const canRefund = resOrder.transactions.filter(transaction => {
            if (
              [TRANSACTION_KIND.SALE, TRANSACTION_KIND.CAPTURE].indexOf(transaction.kind) > -1
              && transaction.status === TRANSACTION_STATUS.SUCCESS
            ) {
              return transaction
            }
          })
          return Sequelize.Promise.mapSeries(canRefund, transaction => {
            return this.app.services.TransactionService.refund(
              transaction,
              { transaction: options.transaction || null }
            )
          })
        }
      })
      .then(refundedTransactions => {
        // Filter the successes
        const newRefunds = refundedTransactions.filter(transaction =>
          transaction.kind === TRANSACTION_KIND.REFUND
          && transaction.status === TRANSACTION_STATUS.SUCCESS)
        // Create the refunds
        return Sequelize.Promise.mapSeries(newRefunds, transaction => {
          return resOrder.createRefund({
            order_id: resOrder.id,
            transaction_id: transaction.id,
            amount: transaction.amount
          }, {
            transaction: options.transaction || null
          })
        })
      })
      .then(newRefunds => {
        return resOrder.reload({ transaction: options.transaction || null })
      })
      .then(() => {
        let totalRefunds = 0
        resOrder.refunds.forEach(refund => {
          totalRefunds = totalRefunds + refund.amount
        })
        resOrder.total_refunds = totalRefunds
        return resOrder.saveFinancialStatus({ reload: true, transaction: options.transaction || null })
      })
      .then(() => {
        const event = {
          object_id: resOrder.id,
          object: 'order',
          objects: [{
            customer: resOrder.customer_id
          }, {
            order: resOrder.id
          }],
          type: `order.${resOrder.financial_status}`,
          message: `Order ${ resOrder.name } was ${resOrder.financial_status}`,
          data: resOrder
        }
        return this.publish(event.type, event, {
          save: true,
          transaction: options.transaction || null
        })
      })
      .then(() => {
        return resOrder.sendRefundedEmail({transaction: options.transaction || null})
      })
      .then(email => {
        return Order.findByIdDefault(resOrder.id, {transaction: options.transaction || null})
      })
  }

  /**
   *
   * @param order
   * @param authorizations
   * @param options
   * @returns {Promise.<T>}
   */
  authorize(order, authorizations = [], options: {[key: string]: any} = {}) {
    const Order = this.app.models['Order']
    let resOrder
    return Order.resolve(order, { transaction: options.transaction || null })
      .then(_order => {
        if (!_order) {
          throw new ModelError('E_NOT_FOUND', 'Order not found')
        }

        resOrder = _order
        return resOrder.resolveTransactions({ transaction: options.transaction || null })
      })
      .then(() => {
        // Partially Authorize
        if (authorizations.length > 0) {
          // Filter the authorizations
          const toAuthorize = authorizations.map(authorize => {
            const authorizeTransaction = resOrder.transactions.find(transaction => transaction.id === authorize.transaction)

            if (
              authorizeTransaction
              && authorizeTransaction.kind === TRANSACTION_KIND.AUTHORIZE
              && authorizeTransaction.status === TRANSACTION_STATUS.PENDING
            ) {
              return authorizeTransaction
            }
          }).filter(n => n)
          // Authorize the pending transactions
          return Order.sequelize.Promise.mapSeries(toAuthorize, transaction => {
            return this.app.services.TransactionService.authorize(
              transaction,
              {transaction: options.transaction || null}
            )
          })
        }
        // Completely Authorize the order
        else {
          const canAuthorize = resOrder.transactions.filter(transaction => {
            if (
              transaction.kind === TRANSACTION_KIND.AUTHORIZE
              && transaction.status === TRANSACTION_STATUS.PENDING
            ) {
              return transaction
            }
          })
          return Order.sequelize.Promise.mapSeries(canAuthorize, transaction => {
            return this.app.services.TransactionService.authorize(
              transaction,
              {transaction: options.transaction || null }
            )
          })
        }
      })
      .then(() => {
        return resOrder.saveFinancialStatus({ transaction: options.transaction || null })
      })
      .then(() => {
        return Order.findByIdDefault(resOrder.id, {transaction: options.transaction || null})
      })
  }
  /**
   *
   * @param order
   * @param captures
   * @param options
   * @returns {Promise.<TResult>}
   */
  capture(order, captures = [], options: {[key: string]: any} = {}) {
    const Order = this.app.models['Order']
    const Sequelize = Order.sequelize
    let resOrder
    return Order.resolve(order, options)
      .then(_order => {
        if (!_order) {
          throw new ModelError('E_NOT_FOUND', 'Order not found')
        }
        resOrder = _order
        return resOrder.resolveTransactions({transaction: options.transaction || null})
      })
      .then(() => {
        // Partially Capture
        if (captures.length > 0) {
          // Filter the captures
          const toCapture = captures.map(capture => {
            const captureTransaction = resOrder.transactions.find(transaction => transaction.id === capture.transaction)
            if (
              captureTransaction
              && captureTransaction.kind === TRANSACTION_KIND.AUTHORIZE
              && captureTransaction.status === TRANSACTION_STATUS.SUCCESS
            ) {
              return captureTransaction
            }
          }).filter(n => n)
          // Capture the authorized transactions
          return Sequelize.Promise.mapSeries(toCapture, transaction => {
            return this.app.services.TransactionService.capture(
              transaction,
              {transaction: options.transaction || null}
            )
          })
        }
        // Completely Capture the order
        else {
          const canCapture = resOrder.transactions.filter(transaction => {
            if (
              transaction.kind === TRANSACTION_KIND.AUTHORIZE
              && transaction.status === TRANSACTION_STATUS.SUCCESS
            ) {
              return transaction
            }
          })
          return Sequelize.Promise.mapSeries(canCapture, transaction => {
            return this.app.services.TransactionService.capture(
              transaction,
              {transaction: options.transaction || null}
            )
          })
        }
      })
      .then(_captures => {
        return resOrder.saveFinancialStatus({ transaction: options.transaction || null })
      })
      .then(_order => {
        return Order.findByIdDefault(resOrder.id, { transaction: options.transaction || null })
      })
  }

  /**
   *
   * @param order
   * @param voids
   * @param options
   * @returns {Promise.<TResult>}
   */
  void(order, voids = [], options: {[key: string]: any} = {}) {
    const Order = this.app.models['Order']
    const Sequelize = Order.sequelize
    let resOrder
    return Order.resolve(order, options)
      .then(_order => {
        if (!_order) {
          throw new ModelError('E_NOT_FOUND', 'Order not found')
        }
        resOrder = _order
        return resOrder.resolveTransactions({ transaction: options.transaction || null })
      })
      .then(() => {
        // Partially Void
        if (voids.length > 0) {
          // Filter the voids
          const toVoid = voids.map(tVoid => {
            const voidTransaction = resOrder.transactions.find(transaction => transaction.id === tVoid.transaction)
            if (
              voidTransaction
              && voidTransaction.kind === TRANSACTION_KIND.AUTHORIZE
              && voidTransaction.status === TRANSACTION_STATUS.SUCCESS
            ) {
              return voidTransaction
            }
          }).filter(n => n)
          // Void the authorized transactions
          return Sequelize.Promise.mapSeries(toVoid, transaction => {
            return this.app.services.TransactionService.void(
              transaction,
              {transaction: options.transaction || null}
            )
          })
        }
        // Completely Void the order
        else {
          const canVoid = resOrder.transactions.filter(transaction => {
            if (
              transaction.kind === TRANSACTION_KIND.AUTHORIZE
              && transaction.status === TRANSACTION_STATUS.SUCCESS
            ) {
              return transaction
            }
          })
          return Sequelize.Promise.mapSeries(canVoid, transaction => {
            return this.app.services.TransactionService.void(
              transaction,
              {transaction: options.transaction || null}
            )
          })
        }
      })
      .then(_voids => {
        return resOrder.saveFinancialStatus({ transaction: options.transaction || null })
      })
      .then(_order => {
        return Order.findByIdDefault(resOrder.id, { transaction: options.transaction || null })
      })
  }

  /**
   *
   * @param order
   * @param retries
   * @param options
   * @returns {Promise.<T>}
   */
  retry(order, retries, options) {
    retries = retries || []
    options = options || {}
    const Order = this.app.models['Order']
    const Sequelize = Order.sequelize
    let resOrder
    return Order.resolve(order, options)
      .then(_order => {
        if (!_order) {
          throw new ModelError('E_NOT_FOUND', 'Order not found')
        }
        resOrder = _order
        return resOrder.resolveTransactions({ transaction: options.transaction || null })
      })
      .then(() => {
        // Partially retry
        if (retries.length > 0) {
          const toRetry = retries.map(tRetry => {
            const retryTransaction = resOrder.transactions.find(transaction => transaction.id === tRetry.transaction)
            if (
              retryTransaction
              && [TRANSACTION_STATUS.FAILURE, TRANSACTION_STATUS.PENDING].indexOf(retryTransaction.status) !== -1
            ) {
              return retryTransaction
            }
          }).filter(n => n)
          // Retry the authorized transactions
          return Sequelize.Promise.mapSeries(toRetry, transaction => {
            return this.app.services.TransactionService.retry(
              transaction,
              {transaction: options.transaction || null}
            )
          })
        }
        // Completely retry the order
        else {
          const canRetry = resOrder.transactions.filter(transaction => {
            if ([TRANSACTION_STATUS.FAILURE, TRANSACTION_STATUS.PENDING].indexOf(transaction.status) !== -1) {
              return transaction
            }
          })
          return Sequelize.Promise.mapSeries(canRetry, transaction => {
            return this.app.services.TransactionService.retry(
              transaction,
              {transaction: options.transaction || null}
            )
          })
        }
      })
      .then(_retries => {
        return resOrder.saveFinancialStatus({transaction: options.transaction || null})
      })
      .then(() => {
        if (resOrder.financial_status === ORDER_FINANCIAL.PAID) {
          return resOrder.sendPaidEmail({transaction: options.transaction || null})
        }
        else if (resOrder.financial_status === ORDER_FINANCIAL.PARTIALLY_PAID) {
          return resOrder.sendPartiallyPaidEmail({transaction: options.transaction || null})
        }
        return
      })
      .then(() => {
        return Order.findByIdDefault(resOrder.id, {transaction: options.transaction || null})
      })
  }

  /**
   * Cancel an Order
   * @param order
   * @param options
   * @returns {Promise.<TResult>}
   */
  cancel(order, options: {[key: string]: any} = {}) {
    const Order = this.app.models['Order']
    const Sequelize = Order.sequelize
    const reason = order.cancel_reason || ORDER_CANCEL.OTHER


    // Make sure order_items is in includes
    options.includes = options.includes || []
    if (!options.includes.some(include => include.model === this.app.models['OrderItem'].instance)) {
      options.includes.push({
        model: this.app.models['OrderItem'].instance,
        as: 'order_items'
      })
    }

    if (!options.includes.some(include => include.model === this.app.models['Fulfillment'].instance)) {
      options.includes.push({
        model: this.app.models['Fulfillment'].instance,
        as: 'fulfillments'
      })
    }

    if (!options.includes.some(include => include.model === this.app.models['Transaction'].instance)) {
      options.includes.push({
        model: this.app.models['Transaction'].instance,
        as: 'transactions'
      })
    }

    if (!options.includes.some(include => include.model === this.app.models['Refund'].instance)) {
      options.includes.push({
        model: this.app.models['Refund'].instance,
        as: 'refunds'
      })
    }

    let resOrder, canRefund = [], canVoid = [], canCancel = [], canCancelFulfillment = []
    return Order.resolve(order, options)
      .then(_order => {
        if (!_order) {
          throw new Error('Order not found')
        }
        resOrder = _order
        if (
          [ORDER_FULFILLMENT.NONE, ORDER_FULFILLMENT.PENDING, ORDER_FULFILLMENT.SENT]
            .indexOf(resOrder.fulfillment_status) < 0
        ) {
          // tslint:disable:max-line-length
          throw new Error(`Order can not be cancelled because it's fulfillment status is ${resOrder.fulfillment_status} not '${ORDER_FULFILLMENT.NONE}', '${ORDER_FULFILLMENT.PENDING}', '${ORDER_FULFILLMENT.SENT}'`)
        }

        return resOrder.resolveTransactions({ transaction: options.transaction || null })
      })
      .then(() => {
        // Transactions that can be refunded
        canRefund = resOrder.transactions.filter(transaction =>
          [TRANSACTION_KIND.SALE, TRANSACTION_KIND.CAPTURE].indexOf(transaction.kind) > -1
          && transaction.status === TRANSACTION_STATUS.SUCCESS
        )
        // Transactions that can be voided
        canVoid = resOrder.transactions.filter(transaction =>
          transaction.kind === TRANSACTION_KIND.AUTHORIZE
          && transaction.status === TRANSACTION_STATUS.SUCCESS
        )
        // Transactions that can be cancelled
        canCancel = resOrder.transactions.filter(transaction => transaction.status === TRANSACTION_STATUS.PENDING)

        // Start Refunds
        return Sequelize.Promise.mapSeries(canRefund, transaction => {
          return this.app.services.TransactionService.refund(transaction, {
            transaction: options.transaction || null
          })
        })
      })
      .then(() => {
        // Start Voids
        return Sequelize.Promise.mapSeries(canVoid, transaction => {
          return this.app.services.TransactionService.void(transaction, {
            transaction: options.transaction || null
          })
        })
      })
      .then(() => {
        // Start Cancels
        return Sequelize.Promise.mapSeries(canCancel, transaction => {
          return this.app.services.TransactionService.cancel(transaction, {
            transaction: options.transaction || null
          })
        })
      })
      .then(() => {
        return resOrder.resolveFulfillments({ transaction: options.transaction || null })
      })
      .then(() => {
        // Start Cancel fulfillments
        canCancelFulfillment = resOrder.fulfillments.filter(fulfillment =>
          [FULFILLMENT_STATUS.PENDING, FULFILLMENT_STATUS.NONE, FULFILLMENT_STATUS.SENT].indexOf(fulfillment.status) > -1)
        return Sequelize.Promise.mapSeries(canCancelFulfillment, fulfillment => {
          return this.app.services.FulfillmentService.cancelFulfillment(
            fulfillment,
            {transaction: options.transaction || null}
          )
        })
      })
      .then(() => {
        return resOrder
          .cancel({cancel_reason: reason})
          .save({ transaction: options.transaction || null })
      })
      .then(() => {
        // Track Event
        const event = {
          object_id: resOrder.id,
          object: 'order',
          objects: [{
            order: resOrder.id
          }, {
            customer: resOrder.customer_id
          }],
          type: 'order.cancelled',
          message: `Order ${resOrder.name} was cancelled`,
          data: resOrder
        }
        return this.publish(event.type, event, {
          save: true,
          transaction: options.transaction || null
        })
      })
      .then(() => {
        return resOrder.sendCancelledEmail({transaction: options.transaction || null})
      })
      .then(() => {
        // return resOrder.reload({ transaction: options.transaction || null }) //
        return Order.findByIdDefault(resOrder.id)
      })
  }

  /**
   *
   * @param customerAddress
   * @param address
   * @returns {*}
   */
  resolveToAddress(customerAddress, address) {
    const Address = this.app.models.Address
    if (address && !_.isEmpty(address)) {
      address =  this.app.services.ProxyCartService.validateAddress(address)
      return address
    }
    else {
      if (customerAddress instanceof Address.instance) {
        return customerAddress.get({plain: true})
      }
      else {
        return customerAddress
      }
    }
  }

  /**
   *
   */
  addTag(order, tag, options: {[key: string]: any} = {}) {
    const Order = this.app.models['Order']
    const Tag = this.app.models['Tag']
    let resOrder, resTag
    return Order.resolve(order, { transaction: options.transaction || null })
      .then(_order => {
        if (!_order) {
          throw new ModelError('E_NOT_FOUND', 'Order not found')
        }
        resOrder = _order
        return Tag.resolve(tag, { transaction: options.transaction || null })
      })
      .then(_tag => {
        if (!_tag) {
          throw new ModelError('E_NOT_FOUND', 'Tag not found')
        }
        resTag = _tag
        return resOrder.hasTag(resTag.id, { transaction: options.transaction || null })
      })
      .then(hasTag => {
        if (!hasTag) {
          return resOrder.addTag(resTag.id, { transaction: options.transaction || null })
        }
        return resOrder
      })
      .then(_tag => {
        return Order.findByIdDefault(resOrder.id, { transaction: options.transaction || null })
      })
  }

  /**
   * Remove a Tag from an Order
   */
  removeTag(order, tag, options: {[key: string]: any} = {}) {
    let resOrder, resTag
    const Order = this.app.models['Order']
    const Tag = this.app.models['Tag']
    return Order.resolve(order, { transaction: options.transaction || null })
      .then(_order => {
        if (!_order) {
          throw new ModelError('E_NOT_FOUND', 'Order not found')
        }
        resOrder = _order
        return Tag.resolve(tag, { transaction: options.transaction || null })
      })
      .then(_tag => {
        if (!_tag) {
          throw new ModelError('E_NOT_FOUND', 'Tag not found')
        }
        resTag = _tag
        return resOrder.hasTag(resTag.id, { transaction: options.transaction || null })
      })
      .then(hasTag => {
        if (hasTag) {
          return resOrder.removeTag(resTag.id, { transaction: options.transaction || null })
        }
        return resOrder
      })
      .then(_tag => {
        return Order.findByIdDefault(resOrder.id, { transaction: options.transaction || null })
      })
  }

  /**
   *
   * @param overrides
   * @param id
   * @param admin
   * @param options
   * @returns {Promise}
   */
  pricingOverrides(overrides, id, admin, options: {[key: string]: any} = {}) {
    const Order = this.app.models['Order']
    // Standardize the input
    if (_.isObject(overrides) && overrides.pricing_overrides) {
      overrides = overrides.pricing_overrides
    }
    overrides = overrides.map(override => {
      // Add the admin id to the override
      override.admin_id = override.admin_id ? override.admin_id : admin.id
      // Make sure price is a number
      override.price = this.app.services.ProxyCartService.normalizeCurrency(parseInt(override.price, 10))
      return override
    })
    let resOrder
    return Order.resolve(id, {transaction: options.transaction || null})
      .then(_order => {
        if (!_order) {
          throw new Error('Order could not be resolved')
        }
        if ([ORDER_STATUS.OPEN, ORDER_STATUS.DRAFT].indexOf(_order.status) === -1) {
          throw new Error(`Order is already ${_order.status}`)
        }

        resOrder = _order
        resOrder.pricing_overrides = overrides
        resOrder.pricing_override_id = admin.id

        return resOrder.save({transaction: options.transaction || null})
      })
      .then(createdItem => {
        return resOrder.recalculate({ transaction: options.transaction || null })
      })
      .then(() => {
        // Track Event
        const event = {
          object_id: resOrder.id,
          object: 'order',
          objects: [{
            order: resOrder.id
          }],
          type: 'order.pricingOverride',
          message: `Order ${resOrder.name} pricing overrides updated`,
          data: resOrder
        }
        return this.publish(event.type, event, {
          save: true,
          transaction: options.transaction || null
        })
      })
      .then(event => {
        return resOrder // Order.findByIdDefault(resOrder.id)
      })
  }

  /**
   *
   * @param order
   * @param item
   * @param options
   * @returns {Promise.<TResult>}
   */
  addItem(order, item, options: {[key: string]: any} = {}) {
    if (!item) {
      throw new ModelError('E_NOT_FOUND', 'Item is not defined')
    }

    // Make sure order_items is in include
    options.include = options.include || []
    if (!options.include.some(include => include.model === this.app.models['OrderItem'].instance)) {
      options.include.push({
        model: this.app.models['OrderItem'].instance,
        as: 'order_items'
      })
    }

    if (!options.include.some(include => include.model === this.app.models['Fulfillment'].instance)) {
      options.include.push({
        model: this.app.models['Fulfillment'].instance,
        as: 'fulfillments'
      })
    }

    if (!options.include.some(include => include.model === this.app.models['Transaction'].instance)) {
      options.include.push({
        model: this.app.models['Transaction'].instance,
        as: 'transactions'
      })
    }

    let resOrder, resItem
    const Order = this.app.models['Order']
    return Order.resolve(order, options)
      .then(_order => {
        if (!_order) {
          throw new ModelError('E_NOT_FOUND', 'Order not found')
        }
        if (_order.status !== ORDER_STATUS.OPEN) {
          throw new Error(`Order is already ${_order.status} and can not be modified`)
        }
        // bind the dao
        resOrder = _order
        return resOrder.resolveOrderItems({ transaction: options.transaction || null })
      })
      .then(() => {
        // Resolve the item of the new order item
        return this.app.services.ProductService.resolveItem(item, { transaction: options.transaction || null })
      })
      .then(_item => {
        if (!_item) {
          throw new Error('Could not resolve product and variant')
        }
        // Build the item
        resItem = resOrder.buildOrderItem(_item, item.quantity, item.properties)
        // Add the item
        return resOrder.addItem(resItem, { transaction: options.transaction || null })
      })
      .then(createdItem => {
        return resOrder.recalculate({ transaction: options.transaction || null })
      })
      .then(() => {
        // Track Event
        const event = {
          object_id: resOrder.id,
          object: 'order',
          objects: [{
            order: resOrder.id
          }, {
            customer: resOrder.customer_id
          }, {
            product: resItem.product_id
          }, {
            productvariant: resItem.variant_id
          }],
          type: 'order.item.created',
          message: `Item added to Order ${resOrder.name}`,
          data: resItem
        }
        return this.publish(event.type, event, {
          save: true,
          transaction: options.transaction || null
        })
      })
      .then(event => {
        return resOrder // Order.findByIdDefault(resOrder.id)
      })
  }

  /**
   *
   * @param order
   * @param items
   * @param options
   * @returns {Promise.<TResult>}
   */
  addItems(order, items, options: {[key: string]: any} = {}) {
    if (!items) {
      throw new ModelError('E_NOT_FOUND', 'Item is not defined')
    }

    // Make sure order_items is in includes
    options.includes = options.includes || []
    if (!options.includes.some(include => include.model === this.app.models['OrderItem'].instance)) {
      options.includes.push({
        model: this.app.models['OrderItem'].instance,
        as: 'order_items'
      })
    }

    if (!options.includes.some(include => include.model === this.app.models['Fulfillment'].instance)) {
      options.includes.push({
        model: this.app.models['Fulfillment'].instance,
        as: 'fulfillments'
      })
    }

    if (!options.includes.some(include => include.model === this.app.models['Transaction'].instance)) {
      options.includes.push({
        model: this.app.models['Transaction'].instance,
        as: 'transactions'
      })
    }

    let resOrder, resItems = []
    const Order = this.app.models['Order']
    const Sequelize = this.app.models['Product'].sequelize
    return Order.resolve(order, options)
      .then(_order => {
        if (!_order) {
          throw new ModelError('E_NOT_FOUND', 'Order not found')
        }
        if (_order.status !== ORDER_STATUS.OPEN) {
          throw new Error(`Order is already ${_order.status} and can not be modified`)
        }
        // bind the dao
        resOrder = _order
        return resOrder.resolveOrderItems({ transaction: options.transaction || null })
      })
      .then(() => {
        // Resolve the item of the new order item
        return this.app.services.ProductService.resolveItems(items, { transaction: options.transaction || null })
      })
      .then(_items => {
        if (!_items || _items.length === 0) {
          throw new Error('Could not resolve products and variants')
        }
        _items = _items.map(item => {
          const newItem = items.find(i =>
            i.id === item.id
            || i.id === item.variant_id
            || i.id === item.product_variant_id
            || i.product_id === item.product_id
          )
          if (newItem.quantity) {
            item.quantity = newItem.quantity
          }
          if (newItem.properties) {
            item.properties = newItem.properties
          }
          return item
        })
        // Setup Transaction
        return Sequelize.transaction(t => {
          return Sequelize.Promise.mapSeries(_items, item => {
            // Build the item
            const resItem = resOrder.buildOrderItem(item, item.quantity, item.properties)
            resItems.push(resItem)
            // Add the item
            return resOrder.addItem(resItem, { transaction: options.transaction || null })
          })
        })
      })
      .then(createdItem => {
        return resOrder.recalculate({ transaction: options.transaction || null })
      })
      .then(() => {
        // Track Event
        const event = {
          object_id: resOrder.id,
          object: 'order',
          objects: [{
            order: resOrder.id
          }, {
            customer: resOrder.customer_id
          }],
          type: 'order.items.created',
          message: `Items added to Order ${resOrder.name}`,
          data: resItems
        }
        return this.publish(event.type, event, {
          save: true,
          transaction: options.transaction || null
        })
      })
      .then(event => {
        return resOrder // Order.findByIdDefault(resOrder.id)
      })
  }

  /**
   *
   * @param order
   * @param item
   * @param options
   * @returns {Promise.<TResult>}
   */
  updateItem(order, item, options: {[key: string]: any} = {}) {
    if (!item) {
      throw new ModelError('E_NOT_FOUND', 'Item is not defined')
    }

    // Make sure order_items is in includes
    options.includes = options.includes || []
    if (!options.includes.some(include => include.model === this.app.models['OrderItem'].instance)) {
      options.includes.push({
        model: this.app.models['OrderItem'].instance,
        as: 'order_items'
      })
    }

    if (!options.includes.some(include => include.model === this.app.models['Fulfillment'].instance)) {
      options.includes.push({
        model: this.app.models['Fulfillment'].instance,
        as: 'fulfillments'
      })
    }

    if (!options.includes.some(include => include.model === this.app.models['Transaction'].instance)) {
      options.includes.push({
        model: this.app.models['Transaction'].instance,
        as: 'transactions'
      })
    }

    let resOrder, resItem
    const Order = this.app.models['Order']
    return Order.resolve(order, options)
      .then(_order => {
        if (!_order) {
          throw new ModelError('E_NOT_FOUND', 'Order not found')
        }
        if (_order.status !== ORDER_STATUS.OPEN) {
          throw new Error(`Order is already ${order.status}`)
        }
        // bind the dao
        resOrder = _order
        return resOrder.resolveOrderItems({transaction: options.transaction || null})
      })
      .then(() => {
        // Resolve the item
        return this.app.services.ProductService.resolveItem(item, { transaction: options.transaction || null})
      })
      .then(_item => {
        if (!_item) {
          throw new Error('Could not resolve product and variant')
        }
        // Build the item
        resItem = resOrder.buildOrderItem(_item, item.quantity, item.properties)
        // Update the item
        return resOrder.updateItem(resItem)
      })
      .then((updatedItem) => {
       // recalculate
        return resOrder.recalculate({transaction: options.transaction || null})
      })
      .then(() => {
        // Track Event
        const event = {
          object_id: resOrder.id,
          object: 'order',
          objects: [{
            order: resOrder.id
          }, {
            customer: resOrder.customer_id
          }, {
            product: resItem.product_id
          }, {
            productvariant: resItem.variant_id
          }],
          type: 'order.item.updated',
          message: `Item updated in Order ${resOrder.name}`,
          data: resItem
        }
        return this.publish(event.type, event, {
          save: true,
          transaction: options.transaction || null
        })
      })
      .then(event => {
        return resOrder // Order.findByIdDefault(resOrder.id)
      })
  }

  /**
   *
   * @param order
   * @param item
   * @param options
   * @returns {Promise.<TResult>}
   */
  removeItem(order, item, options: {[key: string]: any} = {}) {
    if (!item) {
      throw new ModelError('E_NOT_FOUND', 'Item is not defined')
    }

    // Make sure order_items is in includes
    options.includes = options.includes || []
    if (!options.includes.some(include => include.model === this.app.models['OrderItem'].instance)) {
      options.includes.push({
        model: this.app.models['OrderItem'].instance,
        as: 'order_items'
      })
    }

    if (!options.includes.some(include => include.model === this.app.models['Fulfillment'].instance)) {
      options.includes.push({
        model: this.app.models['Fulfillment'].instance,
        as: 'fulfillments'
      })
    }

    if (!options.includes.some(include => include.model === this.app.models['Transaction'].instance)) {
      options.includes.push({
        model: this.app.models['Transaction'].instance,
        as: 'transactions'
      })
    }


    let resOrder, resItem
    const Order = this.app.models['Order']
    return Order.resolve(order, options)
      .then(_order => {
        if (!_order) {
          throw new ModelError('E_NOT_FOUND', 'Order not found')
        }
        if (_order.status !== ORDER_STATUS.OPEN) {
          throw new Error(`Order is already ${_order.status}`)
        }
        // bind the dao
        resOrder = _order
        return resOrder.resolveOrderItems({transaction: options.transaction || null})
      }).
      then(() => {
        // Resolve the item
        return this.app.services.ProductService.resolveItem(item, { transaction: options.transaction || null})
      })
      .then(_item => {
        if (!_item) {
          throw new Error('Could not resolve product and variant')
        }
        // Build the item
        resItem = resOrder.buildOrderItem(_item, item.quantity, item.properties)
        // Remove the item
        return resOrder.removeItem(resItem, {transaction: options.transaction || null})
      })
      .then(() => {
        // recalculate
        return resOrder.recalculate({transaction: options.transaction || null})
      })
      .then(() => {
        // Track Event
        const event = {
          object_id: resOrder.id,
          object: 'order',
          objects: [{
            order: resOrder.id
          }, {
            customer: resOrder.customer_id
          }, {
            product: resItem.product_id
          }, {
            productvariant: resItem.variant_id
          }],
          type: 'order.item.removed',
          message: `Item removed from Order ${resOrder.name}`,
          data: resItem
        }
        return this.publish(event.type, event, {
          save: true,
          transaction: options.transaction || null
        })
      })
      .then(event => {
        return resOrder // Order.findByIdDefault(resOrder.id)
      })
  }

  /**
   *
   * @param order
   * @param shipping
   * @param options
   * @returns {Promise.<T>}
   */
  addShipping(order, shipping, options: {[key: string]: any} = {}) {
    if (!shipping) {
      throw new ModelError('E_NOT_FOUND', 'Shipping is not defined')
    }
    let resOrder
    const Order = this.app.models['Order']
    return Order.resolve(order, options)
      .then(_order => {
        if (!_order) {
          throw new ModelError('E_NOT_FOUND', 'Order not found')
        }
        if (_order.status !== ORDER_STATUS.OPEN) {
          throw new Error(`Order is already ${_order.status}`)
        }
        resOrder = _order
        return resOrder.addShipping(shipping, {transaction: options.transaction || null})
      })
  }

  /**
   *
   * @param order
   * @param shipping
   * @param options
   * @returns {Promise.<T>}
   */
  removeShipping(order, shipping, options: {[key: string]: any} = {}) {
    if (!shipping) {
      throw new ModelError('E_NOT_FOUND', 'Shipping is not defined')
    }
    let resOrder
    const Order = this.app.models['Order']
    return Order.resolve(order, options)
      .then(_order => {
        if (!_order) {
          throw new ModelError('E_NOT_FOUND', 'Order not found')
        }
        if (_order.status !== ORDER_STATUS.OPEN) {
          throw new Error(`Order is already ${_order.status}`)
        }
        resOrder = _order
        return resOrder.removeShipping(shipping, {transaction: options.transaction || null})
      })
  }

  /**
   *
   * @param order
   * @param taxes
   * @param options
   * @returns {Promise.<T>}
   */
  addTaxes(order, taxes, options: {[key: string]: any} = {}) {
    if (!taxes) {
      throw new ModelError('E_NOT_FOUND', 'Taxes is not defined')
    }
    let resOrder
    const Order = this.app.models['Order']
    return Order.resolve(order, options)
      .then(_order => {
        if (!_order) {
          throw new ModelError('E_NOT_FOUND', 'Order not found')
        }
        if (_order.status !== ORDER_STATUS.OPEN) {
          throw new Error(`Order is already ${_order.status}`)
        }
        resOrder = _order
        return resOrder.addTaxes(taxes, {transaction: options.transaction || null})
      })
  }

  /**
   *
   * @param order
   * @param taxes
   * @param options
   * @returns {Promise.<T>}
   */
  removeTaxes(order, taxes, options: {[key: string]: any} = {}) {
    if (!taxes) {
      throw new ModelError('E_NOT_FOUND', 'Taxes is not defined')
    }
    let resOrder
    const Order = this.app.models['Order']
    return Order.resolve(order, options)
      .then(_order => {
        if (!_order) {
          throw new ModelError('E_NOT_FOUND', 'Order not found')
        }
        if (_order.status !== ORDER_STATUS.OPEN) {
          throw new Error(`Order is already ${_order.status}`)
        }
        resOrder = _order
        return resOrder.removeTaxes(taxes, {transaction: options.transaction || null})
      })
  }

  /**
   *
   * @param order
   * @param fulfillments
   * @param options
   * @returns {Promise.<T>}
   */
  fulfill(order, fulfillments = [], options: {[key: string]: any} = {}) {

    // Make this an array
    if (!_.isArray(fulfillments)) {
      fulfillments = [fulfillments]
    }

    // Make sure order_items is in include
    options.include = options.include || []
    if (!options.include.some(include => include.model === this.app.models['OrderItem'].instance)) {
      options.include.push({
        model: this.app.models['OrderItem'].instance,
        as: 'order_items'
      })
    }

    if (!options.include.some(include => include.model === this.app.models['Fulfillment'].instance)) {
      options.include.push({
        model: this.app.models['Fulfillment'].instance,
        as: 'fulfillments'
      })
    }

    if (!options.include.some(include => include.model === this.app.models['Transaction'].instance)) {
      options.include.push({
        model: this.app.models['Transaction'].instance,
        as: 'transactions'
      })
    }


    let resOrder
    const Order = this.app.models['Order']
    return Order.resolve(order, options)
      .then(_order => {
        if (!_order) {
          throw new ModelError('E_NOT_FOUND', 'Order not found')
        }
        if (_order.status !== ORDER_STATUS.OPEN) {
          throw new Error(`Order is already ${_order.status}`)
        }
        resOrder = _order
        // if this is missing id, this means we will be updating all fulfillment on the order.
        if (fulfillments.every(f => !f.id) && fulfillments.length === 1) {
          return resOrder.getFulfillments({transaction: options.transaciton || null})
        }
        else {
          return []
        }
      })
      .then(_fulfillments => {
        _fulfillments = _fulfillments || []
        // Map the ID with the data from the fulfillment object
        _fulfillments.map(f => {
          return _.merge({
            id: f.id
          }, fulfillments[0])
        })

        fulfillments = [...fulfillments, ..._fulfillments]

        return resOrder.fulfill(fulfillments, {transaction: options.transaction || null})
      })
      .then(() => {
        return resOrder.reload({ transaction: options.transaction || null }) // Order.findByIdDefault(resOrder.id)
      })
  }

  /**
   *
   * @param order
   * @param fulfillments
   * @param options
   * @returns {Promise.<T>}
   */
  send(order, fulfillments = [], options: {[key: string]: any} = {}) {
    const Order = this.app.models['Order']
    if (typeof fulfillments === 'string') {
      fulfillments = [fulfillments]
    }

    // Make sure order_items is in includes
    options.includes = options.includes || []
    if (!options.includes.some(include => include.model === this.app.models['OrderItem'].instance)) {
      options.includes.push({
        model: this.app.models['OrderItem'].instance,
        as: 'order_items'
      })
    }

    if (!options.includes.some(include => include.model === this.app.models['Fulfillment'].instance)) {
      options.includes.push({
        model: this.app.models['Fulfillment'].instance,
        as: 'fulfillments'
      })
    }

    if (!options.includes.some(include => include.model === this.app.models['Transaction'].instance)) {
      options.includes.push({
        model: this.app.models['Transaction'].instance,
        as: 'transactions'
      })
    }

    if (!options.includes.some(include => include.model === this.app.models['Refund'].instance)) {
      options.includes.push({
        model: this.app.models['Refund'].instance,
        as: 'refunds'
      })
    }

    let resOrder
    return Order.resolve(order, options)
      .then(_order => {
        if (!_order) {
          throw new ModelError('E_NOT_FOUND', 'Order not found')
        }
        if (_order.status !== ORDER_STATUS.OPEN) {
          throw new Error(`Order is already ${_order.status}`)
        }
        resOrder = _order

        if (fulfillments.length === 0) {
          return resOrder.getFulfillments({transaction: options.transaction || null})
        }
        else {
          return []
        }
      })
      .then(_fulfillments => {
        _fulfillments = _fulfillments || []

        fulfillments = [...fulfillments, ..._fulfillments]

        return Order.sequelize.Promise.mapSeries(fulfillments, fulfillment => {
          return this.app.services.FulfillmentService.sendFulfillment(
            resOrder,
            fulfillment,
            {transaction: options.transaction || null}
          )
        })
      })
      // .then(() => {
      //   return resOrder.resolveFulfillmentStatus({reload: true, transaction: options.transaction || null})
      // })
      .then(() => {
        // return resOrder.reload({ transaction: options.transaction || null }) //
        return Order.findByIdDefault(resOrder.id)
      })
  }


  /**
   * @param order
   * @param transaction
   * @param options
   * @returns {Promise.<transaction>}
   */
  authorizeTransaction(order, transaction, options: {[key: string]: any} = {}) {
    const Order = this.app.models['Order']
    let resOrder, resTransaction


    return Order.resolve(order, {transaction: options.transaction || null})
      .then(_order => {
        if (!_order) {
          throw new ModelError('E_NOT_FOUND', 'Order not found')
        }
        resOrder = _order
        return this.app.services.TransactionService.authorize(transaction, {transaction: options.transaction || null})
      })
      .then(_transaction => {
        if (!_transaction) {
          throw new ModelError('E_NOT_FOUND', 'Transaction not found')
        }
        resTransaction = _transaction
        return resOrder.reload({transaction: options.transaction || null})
      })
      .then(() => {
        return {
          order: resOrder,
          transaction: resTransaction
        }
      })
  }

  /**
   * @param order
   * @param transaction
   * @param options
   * @returns {Promise.<transaction>}
   */
  captureTransaction(order, transaction, options: {[key: string]: any} = {}) {

    const Order = this.app.models['Order']
    let resOrder, resTransaction
    return Order.resolve(order, {transaction: options.transaction || null})
      .then(_order => {
        if (!_order) {
          throw new ModelError('E_NOT_FOUND', 'Order not found')
        }
        resOrder = _order
        return this.app.services.TransactionService.capture(transaction, {transaction: options.transaction || null})
      })
      .then(_transaction => {
        if (!_transaction) {
          throw new ModelError('E_NOT_FOUND', 'Transaction not found')
        }
        resTransaction = _transaction
        return resOrder.reload({transaction: options.transaction || null})
      })
      .then(() => {
        return {
          order: resOrder,
          transaction: resTransaction
        }
      })
  }

  /**
   * @param order
   * @param transaction
   * @param options
   * @returns {Promise.<transaction>}
   */
  payTransaction(order, transaction, options: {[key: string]: any} = {}) {

    const Order = this.app.models['Order']
    let resOrder, resTransaction
    return Order.resolve(order, {transaction: options.transaction || null})
      .then(_order => {
        if (!_order) {
          throw new ModelError('E_NOT_FOUND', 'Order not found')
        }
        resOrder = _order
        return this.app.services.TransactionService.sale(transaction, {transaction: options.transaction || null})
      })
      .then(_transaction => {
        if (!_transaction) {
          throw new ModelError('E_NOT_FOUND', 'Transaction not found')
        }
        resTransaction = _transaction
        return resOrder.reload({transaction: options.transaction || null})
      })
      .then(() => {
        return {
          order: resOrder,
          transaction: resTransaction
        }
      })
  }

  /**
   * @param order
   * @param transaction
   * @param options
   * @returns {Promise.<transaction>}
   */
  refundTransaction(order, transaction, options: {[key: string]: any} = {}) {

    const Order = this.app.models['Order']
    let resOrder, resTransaction
    return Order.resolve(order, {transaction: options.transaction || null})
      .then(_order => {
        if (!_order) {
          throw new ModelError('E_NOT_FOUND', 'Order not found')
        }
        resOrder = _order
        return this.app.services.TransactionService.refund(transaction, {transaction: options.transaction || null})
      })
      .then(_transaction => {
        if (!_transaction) {
          throw new ModelError('E_NOT_FOUND', 'Transaction not found')
        }
        resTransaction = _transaction
        return resOrder.reload({transaction: options.transaction || null})
      })
      .then(() => {
        return {
          order: resOrder,
          transaction: resTransaction
        }
      })
  }

  /**
   * @param order
   * @param transaction
   * @param options
   * @returns {Promise.<transaction>}
   */
  retryTransaction(order, transaction, options: {[key: string]: any} = {}) {

    const Order = this.app.models['Order']
    let resOrder, resTransaction
    return Order.resolve(order, {transaction: options.transaction || null})
      .then(_order => {
        if (!_order) {
          throw new ModelError('E_NOT_FOUND', 'Order not found')
        }
        resOrder = _order
        return this.app.services.TransactionService.retry(transaction, {transaction: options.transaction || null})
      })
      .then(_transaction => {
        if (!_transaction) {
          throw new ModelError('E_NOT_FOUND', 'Transaction not found')
        }
        resTransaction = _transaction
        return resOrder.reload({transaction: options.transaction || null})
      })
      .then(() => {
        return {
          order: resOrder,
          transaction: resTransaction
        }
      })
  }

  /**
   * @param order
   * @param transaction
   * @param options
   * @returns {Promise.<transaction>}
   */
  cancelTransaction(order, transaction, options: {[key: string]: any} = {}) {

    const Order = this.app.models['Order']
    let resOrder, resTransaction
    return Order.resolve(order, {transaction: options.transaction || null})
      .then(_order => {
        if (!_order) {
          throw new ModelError('E_NOT_FOUND', 'Order not found')
        }
        resOrder = _order
        return this.app.services.TransactionService.cancel(transaction, {transaction: options.transaction || null})
      })
      .then(_transaction => {
        if (!_transaction) {
          throw new ModelError('E_NOT_FOUND', 'Transaction not found')
        }
        resTransaction = _transaction
        return resOrder.reload({transaction: options.transaction || null})
      })
      .then(() => {
        return {
          order: resOrder,
          transaction: resTransaction
        }
      })
  }
  /**
   * @param order
   * @param transaction
   * @param options
   * @returns {Promise.<transaction>}
   */
  voidTransaction(order, transaction, options: {[key: string]: any} = {}) {

    const Order = this.app.models['Order']
    let resOrder, resTransaction
    return Order.resolve(order, {transaction: options.transaction || null})
      .then(_order => {
        if (!_order) {
          throw new ModelError('E_NOT_FOUND', 'Order not found')
        }
        resOrder = _order
        return this.app.services.TransactionService.void(transaction, {transaction: options.transaction || null})
      })
      .then(_transaction => {
        if (!_transaction) {
          throw new ModelError('E_NOT_FOUND', 'Transaction not found')
        }
        resTransaction = _transaction
        return resOrder.reload({transaction: options.transaction || null})
      })
      .then(() => {
        return {
          order: resOrder,
          transaction: resTransaction
        }
      })
  }


  /**
   * @param order
   * @param fulfillment
   * @param options
   * @returns {Promise.<fulfillment>}
   */
  manualUpdateFulfillment(order, fulfillment, options: {[key: string]: any} = {}) {
    const Order = this.app.models['Order']
    let resOrder, resFulfillment
    return Order.resolve(order, {transaction: options.transaction || null})
      .then(_order => {
        if (!_order) {
          throw new ModelError('E_NOT_FOUND', 'Order not found')
        }
        resOrder = _order
        return this.app.services.FulfillmentService.manualUpdateFulfillment(fulfillment, {transaction: options.transaction || null})
      })
      .then(_fulfillment => {
        if (!_fulfillment) {
          throw new ModelError('E_NOT_FOUND', 'Fulfillment not found')
        }
        resFulfillment = _fulfillment
        return resOrder.reload({transaction: options.transaction || null})
      })
      .then(() => {
        return {
          order: resOrder,
          fulfillment: resFulfillment
        }
      })
  }

  retryThisHour() {
    //

  }

  /**
   *
   * @param options
   * @returns {Promise.<T>}
   */
  cancelThisHour(options) {
    // options = options || {}
    // const Order = this.app.models['Order']
    // const errors = []
    //
    // const start = moment().startOf('hour')
    //   .subtract(this.app.config.get('cart.orders.grace_period_days') || 0, 'days')
    //
    // // let errorsTotal = 0
    // let ordersTotal = 0
    //
    // this.app.log.debug('OrderService.cancelThisHour', start.format('YYYY-MM-DD HH:mm:ss'))
    //
    // // Find Orders that are at their max retry amount
    // // and aren't already cancelled.
    // // and have reached the end of the grace period
    // return Order.batch({
    //   where: {
    //     // renews_on: {
    //     //   $gte: start.format('YYYY-MM-DD HH:mm:ss')
    //     // },
    //     // total_renewal_attempts: {
    //     //   $gte: this.app.config.cart.orders.retry_attempts || 1
    //     // },
    //     // // Not cancelled
    //     // cancelled: false
    //     status: ORDER_STATUS.OPEN
    //   },
    //   regressive: true,
    //   transaction: options.transaction || null
    // }, (orders) => {
    //
    //   const Sequelize = Order.sequelize
    //   return Sequelize.Promise.mapSeries(orders, order => {
    //     return this.cancel(
    //       {
    //         reason: ORDER_CANCEL.FUNDING,
    //         cancel_pending: true
    //       },
    //       order,
    //       { transaction: options.transaction || null }
    //     )
    //   })
    //     .then(results => {
    //       // Calculate Totals
    //       ordersTotal = ordersTotal + results.length
    //       return
    //     })
    //     .catch(err => {
    //       // errorsTotal++
    //       this.app.log.error(err)
    //       errors.push(err)
    //       return
    //     })
    // })
    //   .then(orders => {
    //     const results = {
    //       orders: ordersTotal,
    //       errors: errors
    //     }
    //     this.app.log.info(results)
    //     this.app.services.EventsService.publish('orders.cancel.complete', results)
    //     return results
    //   })
    //   .catch(err => {
    //     this.app.log.error(err)
    //     return
    //   })
  }

  /**
   *
   * @param item
   * @param options
   * @returns {Promise.<T>}
   */
  itemBeforeCreate(item, options: {[key: string]: any} = {}) {
    return item.recalculate({transaction: options.transaction || null})
      .then(() => {
        return item
      })
    // return Promise.resolve(item)
  }

  /**
   *
   * @param item
   * @param options
   * @returns {Promise.<T>}
   */
  itemBeforeUpdate(item, options: {[key: string]: any} = {}) {
    return item.recalculate({transaction: options.transaction || null})
      .then(() => {
        return item
      })
//    return Promise.resolve(item)
  }

  /**
   *
   * @param item
   * @param options
   * @returns {Promise.<T>}
   */
  itemBeforeSave(item, options: {[key: string]: any} = {}) {
    return item.recalculate({transaction: options.transaction || null})
      .then(() => {
        return item
      })
//    return Promise.resolve(item)
  }
  /**
   *
   * @param item
   * @param options
   * @returns {Promise.<T>}
   */
  itemAfterCreate(item, options: {[key: string]: any} = {}) {
    // return item.reconcileFulfillment()
    //   .then(item => {
    //     return item
    //   })
    return Promise.resolve(item)
  }

  /**
   *
   * @param item
   * @param options
   * @returns {Promise.<T>}
   */
  itemAfterUpdate(item, options: {[key: string]: any} = {}) {
    // return item.reconcileFulfillment()
    //   .then(item => {
    //     return item
    //   })
    return Promise.resolve(item)
  }

  itemAfterDestroy(item, options: {[key: string]: any} = {}) {
    // return item.reconcileFulfillment()
    //   .then(item => {
    //     return item
    //   })
    return Promise.resolve(item)
  }

  /**
   *
   * @param order
   * @param options
   * @returns {Promise.<T>}
   */
  afterCreate(order, options: {[key: string]: any} = {}) {
    order.number = `${order.shop_id}-${order.id + 1000}`
    if (!order.name && order.number) {
      order.name = `#${order.number}`
    }
    // this.app.services.EventsService.publish('order.created', order)
    return order.save({transaction: options.transaction || null})
    // return Promise.resolve(order)
  }

  afterUpdate(order, options: {[key: string]: any} = {}) {
    // this.app.services.EventsService.publish('order.updated', order)
    return Promise.resolve(order)
  }
}

