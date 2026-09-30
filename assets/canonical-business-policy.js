(function (global) {
  'use strict';

  const lower = (v) => String(v ?? '').trim().toLowerCase();
  const amount = (v) => Math.max(0, Number(v) || 0);
  const kindOf = (tx) => lower(tx?.transactionKind ?? tx?.transaction_kind ?? 'manual');
  const categoryKeyOf = (tx) => lower(tx?.categorySystemKey ?? tx?.category_system_key ?? '');
  const sourceEntityOf = (tx) => lower(tx?.sourceEntity ?? tx?.source_entity ?? '');

  // FIX17: display labels are property-owned master data and never determine
  // accounting behavior in the browser fallback. Only transaction kind and
  // immutable semantic identity may affect the result.
  function isPbjtSettlement(tx) {
    if (lower(tx?.type) !== 'expense') return false;
    const kind = kindOf(tx);
    return ['pbjt_payment', 'pbjt_settlement'].includes(kind) || categoryKeyOf(tx) === 'pbjt_settlement';
  }

  function isIncomeTaxSettlement(tx) {
    if (lower(tx?.type) !== 'expense' || isPbjtSettlement(tx)) return false;
    return ['pph_payment', 'income_tax_payment', 'corporate_income_tax_payment'].includes(kindOf(tx));
  }

  function recognizedRevenue(tx) {
    const gross = amount(tx?.amount);
    if (gross <= 0) return 0;
    const status = lower(tx?.taxSnapshotStatus ?? tx?.tax_snapshot_status ?? 'unresolved');
    if (status === 'unresolved') return 0;
    const baseRaw = tx?.baseAmount ?? tx?.base_amount;
    const taxRaw = tx?.taxAmount ?? tx?.tax_amount;
    const base = Number(baseRaw);
    const tax = Number(taxRaw);
    if (Number.isFinite(base) && Number.isFinite(tax) && base >= 0 && tax >= 0 && Math.abs((base + tax) - gross) <= 1) {
      return Math.max(0, Math.round((gross - Math.min(gross, tax)) * 100) / 100);
    }
    if (status === 'not_applicable') return gross;
    return 0;
  }

  function transactionSemantics(tx) {
    const serverSemantic = tx?.financialSemantic;
    if (serverSemantic && serverSemantic.policyVersion === 'FINAL12-root-policy-2'
      && typeof serverSemantic.bucket === 'string'
      && Number.isFinite(Number(serverSemantic.incomeDelta))
      && Number.isFinite(Number(serverSemantic.expenseDelta))) {
      return { ...serverSemantic,
        recognizedRevenue: Number(serverSemantic.recognizedRevenue || 0),
        incomeDelta: Number(serverSemantic.incomeDelta || 0),
        expenseDelta: Number(serverSemantic.expenseDelta || 0) };
    }

    const type = lower(tx?.type);
    const kind = kindOf(tx);
    const categorySystemKey = categoryKeyOf(tx);
    const sourceEntity = sourceEntityOf(tx);
    const bookingSource = lower(tx?.bookingSource ?? tx?.booking_source);
    const bank = lower(tx?.bankAccountId ?? tx?.bank_account_id);
    const updatedSource = lower(tx?.updatedSource ?? tx?.updated_source);
    const bookingAction = lower(tx?.bookingAction ?? tx?.booking_action ?? tx?.action);
    const isIncome = type === 'income';
    const isExpense = type === 'expense';
    const isInternalTransfer = ['internal_transfer', 'ota_transfer'].includes(kind) || sourceEntity === 'ota_disbursement';
    const isOtaTransfer = kind === 'ota_transfer' || sourceEntity === 'ota_disbursement';
    const isDepositReceipt = kind === 'security_deposit_received';
    const isDepositRefund = kind === 'security_deposit_refund';
    const isDepositForfeit = kind === 'security_deposit_forfeit';
    const isSecurityDeposit = ['security_deposit_received', 'security_deposit_refund', 'security_deposit_forfeit'].includes(kind);
    const isOpeningBalance = ['opening_balance_cash', 'opening_balance_bank'].includes(kind);
    const isExpenseReversal = isIncome && ['salary_reversal', 'pos_cogs_reversal'].includes(kind);
    const isRevenueRefund = isExpense && !isInternalTransfer && (
      ['refund', 'pos_refund'].includes(kind) || (kind === 'booking_charge' && updatedSource === 'audit-correction')
    );
    const isApPayment = kind === 'supplier_ap_payment';
    const isNonPnlSupplierAccrual = ['supplier_inventory_accrual', 'supplier_asset_accrual'].includes(kind);
    const isTechnicalNonLiquid = ['ota_receivable', 'inventory_asset', 'guest_receivable', 'accounts_payable'].includes(bank);
    const taxStatus = lower(tx?.taxSnapshotStatus ?? tx?.tax_snapshot_status ?? 'unresolved');
    const isTaxUnresolvedReceipt = isIncome && taxStatus === 'unresolved';
    const revenue = recognizedRevenue(tx);
    const isLiquidExternalIncome = isIncome && !isOpeningBalance && !isTaxUnresolvedReceipt && !isDepositForfeit
      && !isTechnicalNonLiquid && (!isInternalTransfer || isOtaTransfer);
    const isLiquidExternalExpense = isExpense && !isTechnicalNonLiquid && !isInternalTransfer;

    let bucket;
    if (isSecurityDeposit) bucket = 'security_deposit';
    else if (isInternalTransfer) bucket = 'internal_transfer';
    else if (categorySystemKey === 'pos_revenue' || categorySystemKey === 'pos_refund'
      || categorySystemKey === 'pos_cogs' || categorySystemKey === 'pos_cogs_reversal'
      || ['pos_sale', 'pos_refund', 'pos_room_charge', 'pos_cogs', 'pos_cogs_reversal'].includes(kind)
      || bookingSource === 'pos') bucket = 'pos';
    else if (bookingAction === 'extension' || kind === 'extension') bucket = 'extension';
    else if (categorySystemKey === 'extra_service' || bookingAction === 'extra'
      || ['extra', 'service'].includes(kind) || kind.startsWith('extra_') || kind.startsWith('service_')) bucket = 'extra';
    else if (categorySystemKey === 'room_rental'
      || ['booking_payment', 'down_payment', 'settlement', 'refund', 'booking_charge'].includes(kind)
      || sourceEntity === 'booking') bucket = 'room';
    else bucket = kind || 'manual';

    let incomeDelta = 0;
    if (!isInternalTransfer && !isOpeningBalance && !isTaxUnresolvedReceipt && !isDepositReceipt && !isDepositRefund && !isExpenseReversal) {
      if (isIncome) incomeDelta = revenue;
      else if (isRevenueRefund) incomeDelta = -revenue;
    }
    let expenseDelta = 0;
    if (!isInternalTransfer && !isSecurityDeposit && !isRevenueRefund && !isPbjtSettlement(tx) && !isIncomeTaxSettlement(tx) && !isApPayment && !isNonPnlSupplierAccrual) {
      if (isExpense) expenseDelta = amount(tx?.amount);
      else if (isExpenseReversal) expenseDelta = -amount(tx?.amount);
    }

    return {
      type, kind, categorySystemKey, sourceEntity, bookingSource, bank, updatedSource, bookingAction,
      isIncome, isExpense, isInternalTransfer, isOtaTransfer, isDepositReceipt, isDepositRefund,
      isDepositForfeit, isSecurityDeposit, isOpeningBalance, isExpenseReversal, isRevenueRefund,
      isPbjtSettlement: isPbjtSettlement(tx), isIncomeTaxSettlement: isIncomeTaxSettlement(tx),
      isApPayment, isNonPnlSupplierAccrual, isTechnicalNonLiquid, isTaxUnresolvedReceipt,
      isLiquidExternalIncome, isLiquidExternalExpense,
      recognizedRevenue: revenue, bucket, incomeDelta, expenseDelta
    };
  }

  // Compatibility signature retained for bundled UI. `action` is now the
  // semantic/bucket value supplied by the caller; category/subcategory/description
  // are deliberately ignored so property labels cannot alter P&L classification.
  function revenueBucket(action = '', _category = '', _subcategory = '', _description = '') {
    const a = lower(action);
    if (['pos', 'pos_sale', 'pos_refund', 'pos_room_charge', 'pos_revenue'].includes(a)) return 'pos';
    if (['room', 'standard', 'extension', 'room_rental', 'booking_payment', 'down_payment', 'settlement', 'booking_charge'].includes(a)) return 'room';
    if (['extra', 'service', 'extra_service'].includes(a)) return 'extra';
    return 'other';
  }

  function isTaxableRevenueLike(tx, _roomCategory = '') {
    const sem = transactionSemantics(tx);
    if (sem.isInternalTransfer || sem.isSecurityDeposit) return false;
    if (['pos_cogs', 'pos_cogs_reversal', 'salary_payment', 'salary_reversal', 'maintenance_cost',
      'supplier_invoice_accrual', 'supplier_inventory_accrual', 'supplier_asset_accrual', 'supplier_ap_payment'].includes(sem.kind)) return false;
    if (['pos_sale', 'pos_refund'].includes(sem.kind) || sem.categorySystemKey === 'pos_revenue') return true;
    if (['room', 'extension', 'extra'].includes(sem.bucket)) return true;
    return ['room_rental', 'extra_service'].includes(sem.categorySystemKey);
  }

  global.TAMASYA_BUSINESS_POLICY = Object.freeze({
    version: 'FINAL12-root-policy-2',
    recognizedRevenue,
    isPbjtSettlement,
    isIncomeTaxSettlement,
    transactionSemantics,
    revenueBucket,
    isTaxableRevenueLike
  });
})(window);
