/**
 * What a pending plan waits on: the card checkout, the upgrade difference charge, or a Pix
 * subscription for a dearer plan whose first payment would end a month already paid.
 */
export const CHECKOUT_REFERENCE = "checkout:";
export const CHARGE_REFERENCE = "charge:";
export const CREATION_REFERENCE = "creating:";
export const SUBSCRIPTION_REFERENCE = "subscription:";
