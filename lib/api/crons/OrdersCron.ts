import { Cron } from '@fabrix/spool-engine'

export class OrdersCron extends Cron {
  /**
   * Retry Failed Orders
   */
  retryFailed() {
    // Every Hour at 5 past Check for orders to retry
    const rule = new this.scheduler.RecurrenceRule()
    rule.minute = 5
    // Schedule the recurring job
    this.scheduler.scheduleJob('OrdersCron.retryFailed', rule, () => {
      this.app.services.OrderService.retryThisHour()
        .catch(err => {
          this.app.log.error(err)
        })
    })
  }

  /**
   * Cancel Failed Orders after Grace Period
   */
  cancelFailed() {
    // Every Hour at 30 past Check for orders to cancel
    const rule = new this.scheduler.RecurrenceRule()
    rule.minute = 10
    // Schedule the recurring job
    this.scheduler.scheduleJob('OrdersCron.cancelFailed', rule, () => {
      this.app.services.OrderService.cancelThisHour()
        .catch(err => {
          this.app.log.error(err)
        })
    })
  }
}
