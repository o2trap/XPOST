/**
 * Realistic Lemon Squeezy webhook bodies. Shapes copied from the example objects on docs.lemonsqueezy.com
 * ("The order object", "The subscription object", "The subscription invoice object", "The license key object",
 * and "Webhook requests" for the meta block), checked 2026-11-15. Only IDs, statuses and dates are parameters;
 * personal data is the docs' placeholder data.
 */
export interface Common { storeId?: number; testMode?: boolean; updatedAt?: string }

const meta = (event_name: string, testMode = false) => ({ meta: { event_name, test_mode: testMode, custom_data: {} } });
const links = (type: string, id: number) => ({ links: { self: `https://api.lemonsqueezy.com/v1/${type}/${id}` } });

export function orderEvent(event: string, o: Common & { orderId: number; productId?: number; variantId?: number; status?: string; refunded?: boolean }) {
  const updated = o.updatedAt ?? '2026-11-14T10:00:00.000000Z';
  return JSON.stringify({
    ...meta(event, o.testMode),
    data: {
      type: 'orders', id: String(o.orderId),
      attributes: {
        store_id: o.storeId ?? 1, customer_id: 1, identifier: '104e18a2-d755-4d4b-80c4-a6c1dcbe1c10', order_number: o.orderId,
        user_name: 'John Doe', user_email: 'johndoe@example.com', currency: 'GBP', currency_rate: '1.0000',
        subtotal: 999, setup_fee: 0, discount_total: 0, tax: 200, total: 1199, subtotal_usd: 999, setup_fee_usd: 0, discount_total_usd: 0, tax_usd: 200, total_usd: 1199,
        tax_name: 'VAT', tax_rate: '20.00', tax_inclusive: false,
        status: o.status ?? 'refunded', status_formatted: 'Refunded', refunded: o.refunded ?? (o.status ?? 'refunded') === 'refunded', refunded_at: updated,
        subtotal_formatted: '£9.99', setup_fee_formatted: '£0.00', discount_total_formatted: '£0.00', tax_formatted: '£2.00', total_formatted: '£11.99',
        first_order_item: {
          id: 1, order_id: o.orderId, product_id: o.productId ?? 10, variant_id: o.variantId ?? 100, product_name: 'xpost', variant_name: 'Default',
          price: 1199, created_at: '2026-11-01T09:45:53.000000Z', updated_at: '2026-11-01T09:45:53.000000Z', test_mode: o.testMode ?? false,
        },
        urls: { receipt: 'https://app.lemonsqueezy.com/my-orders/104e18a2?signature=x' },
        created_at: '2026-11-01T09:45:53.000000Z', updated_at: updated, test_mode: o.testMode ?? false,
      },
      relationships: {}, ...links('orders', o.orderId),
    },
  });
}

export function subscriptionEvent(event: string, o: Common & { subscriptionId: number; orderId: number; status: string; productId?: number; variantId?: number; endsAt?: string | null }) {
  return JSON.stringify({
    ...meta(event, o.testMode),
    data: {
      type: 'subscriptions', id: String(o.subscriptionId),
      attributes: {
        store_id: o.storeId ?? 1, customer_id: 1, order_id: o.orderId, order_item_id: 1, product_id: o.productId ?? 10, variant_id: o.variantId ?? 100,
        product_name: 'xpost', variant_name: 'Monthly', user_name: 'John Doe', user_email: 'johndoe@example.com',
        status: o.status, status_formatted: o.status, card_brand: 'visa', card_last_four: '4242', payment_processor: 'stripe',
        pause: o.status === 'paused' ? { mode: 'void', resumes_at: null } : null, cancelled: o.status === 'cancelled', trial_ends_at: null, billing_anchor: 12,
        first_subscription_item: { id: 1, subscription_id: o.subscriptionId, price_id: 1, quantity: 1, created_at: '2026-11-01T13:47:28.000000Z', updated_at: '2026-11-01T13:47:28.000000Z' },
        urls: { update_payment_method: 'https://x.lemonsqueezy.com/subscription/1/payment-details?signature=x', customer_portal: 'https://x.lemonsqueezy.com/billing?signature=x' },
        renews_at: '2026-12-01T00:00:00.000000Z', ends_at: o.endsAt ?? null, created_at: '2026-11-01T13:47:27.000000Z',
        updated_at: o.updatedAt ?? '2026-11-14T10:00:00.000000Z', test_mode: o.testMode ?? false,
      },
      relationships: {}, ...links('subscriptions', o.subscriptionId),
    },
  });
}

export function invoiceEvent(event: string, o: Common & { invoiceId: number; subscriptionId: number; status?: string; refunded?: boolean; refundedAmount?: number; total?: number; billingReason?: string }) {
  const total = o.total ?? 999;
  return JSON.stringify({
    ...meta(event, o.testMode),
    data: {
      type: 'subscription-invoices', id: String(o.invoiceId),
      attributes: {
        store_id: o.storeId ?? 1, subscription_id: o.subscriptionId, customer_id: 1, user_name: 'John Doe', user_email: 'johndoe@example.com',
        billing_reason: o.billingReason ?? 'renewal', card_brand: 'visa', card_last_four: '4242', currency: 'GBP', currency_rate: '1.00000000',
        status: o.status ?? 'paid', status_formatted: o.status ?? 'Paid', refunded: o.refunded ?? false, refunded_at: o.refunded ? '2026-11-14T10:00:00.000000Z' : null,
        subtotal: total, discount_total: 0, tax: 0, tax_inclusive: false, total, refunded_amount: o.refundedAmount ?? 0,
        subtotal_usd: total, discount_total_usd: 0, tax_usd: 0, total_usd: total, refunded_amount_usd: o.refundedAmount ?? 0,
        urls: { invoice_url: 'https://app.lemonsqueezy.com/my-orders/x/subscription-invoice/y' },
        created_at: '2026-11-14T09:16:24.000000Z', updated_at: o.updatedAt ?? '2026-11-14T10:00:00.000000Z', test_mode: o.testMode ?? false,
      },
      relationships: {}, ...links('subscription-invoices', o.invoiceId),
    },
  });
}

export function licenceKeyEvent(event: string, o: Common & { keyId: number; orderId?: number; productId?: number; status: string; disabled?: boolean; expiresAt?: string | null }) {
  return JSON.stringify({
    ...meta(event, o.testMode),
    data: {
      type: 'license-keys', id: String(o.keyId),
      attributes: {
        store_id: o.storeId ?? 1, customer_id: 1, order_id: o.orderId ?? 1, order_item_id: 1, product_id: o.productId ?? 10,
        user_name: 'John Doe', user_email: 'johndoe@example.com', key: '80e15db5-c796-436b-850c-8f9c98a48abe', key_short: 'XXXX-8f9c98a48abe',
        activation_limit: 2, instances_count: 0, disabled: o.disabled ? 1 : 0, status: o.status, status_formatted: o.status,
        expires_at: o.expiresAt ?? null, created_at: '2026-11-01T14:15:07.000000Z', updated_at: o.updatedAt ?? '2026-11-14T10:00:00.000000Z',
      },
      relationships: {}, ...links('license-keys', o.keyId),
    },
  });
}
