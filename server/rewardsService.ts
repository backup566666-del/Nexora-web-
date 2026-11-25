import type {
  BankAccountResolution,
  BankProviderStatus,
  NigerianBankInfo,
} from '../src/types/nexora';

export const FALLBACK_NIGERIAN_BANKS: NigerianBankInfo[] = [
  { name: 'Access Bank', code: '044', slug: 'access-bank' },
  { name: 'Citibank Nigeria', code: '023', slug: 'citibank-nigeria' },
  { name: 'Ecobank Nigeria', code: '050', slug: 'ecobank-nigeria' },
  { name: 'Fidelity Bank', code: '070', slug: 'fidelity-bank' },
  { name: 'First Bank of Nigeria', code: '011', slug: 'first-bank-of-nigeria' },
  { name: 'First City Monument Bank (FCMB)', code: '214', slug: 'fcmb' },
  { name: 'Globus Bank', code: '00103', slug: 'globus-bank' },
  { name: 'Guaranty Trust Bank (GTBank)', code: '058', slug: 'guaranty-trust-bank' },
  { name: 'Keystone Bank', code: '082', slug: 'keystone-bank' },
  { name: 'Kuda Bank', code: '50211', slug: 'kuda-bank' },
  { name: 'Moniepoint MFB', code: '50515', slug: 'moniepoint-mfb' },
  { name: 'OPay Digital Services', code: '999992', slug: 'opay' },
  { name: 'PalmPay', code: '999991', slug: 'palmpay' },
  { name: 'Polaris Bank', code: '076', slug: 'polaris-bank' },
  { name: 'Providus Bank', code: '101', slug: 'providus-bank' },
  { name: 'Stanbic IBTC Bank', code: '221', slug: 'stanbic-ibtc-bank' },
  { name: 'Sterling Bank', code: '232', slug: 'sterling-bank' },
  { name: 'Titan Trust Bank', code: '102', slug: 'titan-trust-bank' },
  { name: 'Union Bank of Nigeria', code: '032', slug: 'union-bank-of-nigeria' },
  { name: 'United Bank for Africa (UBA)', code: '033', slug: 'united-bank-for-africa' },
  { name: 'Wema Bank', code: '035', slug: 'wema-bank' },
  { name: 'Zenith Bank', code: '057', slug: 'zenith-bank' },
];

export function getBankProviderStatus(): BankProviderStatus {
  const paystackKey = (process.env.PAYSTACK_SECRET_KEY || '').trim();
  const flutterwaveKey = (process.env.FLUTTERWAVE_SECRET_KEY || '').trim();

  if (paystackKey) {
    return {
      configured: true,
      provider: 'paystack',
      message: 'Live Nigerian NUBAN bank account verification is active via Paystack.',
    };
  }

  if (flutterwaveKey) {
    return {
      configured: true,
      provider: 'flutterwave',
      message: 'Live Nigerian NUBAN bank account verification is active via Flutterwave.',
    };
  }

  return {
    configured: false,
    provider: 'none',
    message:
      'Bank account auto-verification is not configured (set PAYSTACK_SECRET_KEY or FLUTTERWAVE_SECRET_KEY). Manual admin bank review applies.',
  };
}

export async function fetchNigerianBanks(): Promise<{
  provider: BankProviderStatus['provider'];
  configured: boolean;
  banks: NigerianBankInfo[];
}> {
  const paystackKey = (process.env.PAYSTACK_SECRET_KEY || '').trim();
  const flutterwaveKey = (process.env.FLUTTERWAVE_SECRET_KEY || '').trim();

  if (paystackKey) {
    try {
      const resp = await fetch('https://api.paystack.co/bank?country=nigeria&perPage=100', {
        headers: { Authorization: `Bearer ${paystackKey}` },
      });
      if (resp.ok) {
        const json = (await resp.json()) as {
          status?: boolean;
          data?: Array<{ name?: string; code?: string; slug?: string; active?: boolean }>;
        };
        if (json.status && Array.isArray(json.data) && json.data.length > 0) {
          const seen = new Set<string>();
          const banks: NigerianBankInfo[] = [];
          for (const item of json.data) {
            if (item.active === false) continue;
            const code = String(item.code || '').trim();
            const name = String(item.name || '').trim();
            if (!code || !name || seen.has(code)) continue;
            seen.add(code);
            banks.push({
              name,
              code,
              slug: typeof item.slug === 'string' ? item.slug : undefined,
            });
          }
          if (banks.length > 0) {
            return {
              provider: 'paystack',
              configured: true,
              banks: banks.sort((a, b) => a.name.localeCompare(b.name)),
            };
          }
        }
      }
    } catch {
      // Fall back cleanly to CBN bank directory list
    }
  }

  if (flutterwaveKey) {
    try {
      const resp = await fetch('https://api.flutterwave.com/v3/banks/NG', {
        headers: { Authorization: `Bearer ${flutterwaveKey}` },
      });
      if (resp.ok) {
        const json = (await resp.json()) as {
          status?: string;
          data?: Array<{ name?: string; code?: string }>;
        };
        if (json.status === 'success' && Array.isArray(json.data) && json.data.length > 0) {
          const seen = new Set<string>();
          const banks: NigerianBankInfo[] = [];
          for (const item of json.data) {
            const code = String(item.code || '').trim();
            const name = String(item.name || '').trim();
            if (!code || !name || seen.has(code)) continue;
            seen.add(code);
            banks.push({ name, code });
          }
          if (banks.length > 0) {
            return {
              provider: 'flutterwave',
              configured: true,
              banks: banks.sort((a, b) => a.name.localeCompare(b.name)),
            };
          }
        }
      }
    } catch {
      // Fall back cleanly to CBN bank directory list
    }
  }

  return {
    provider: paystackKey ? 'paystack' : flutterwaveKey ? 'flutterwave' : 'none',
    configured: Boolean(paystackKey || flutterwaveKey),
    banks: FALLBACK_NIGERIAN_BANKS,
  };
}

export async function resolveNigerianBankAccount(
  rawAccountNumber: string,
  rawBankCode: string
): Promise<BankAccountResolution> {
  const accountNumber = rawAccountNumber.replace(/\D/g, '');
  const bankCode = rawBankCode.trim();

  if (!/^\d{10}$/.test(accountNumber)) {
    return {
      verified: false,
      verificationStatus: 'failed',
      provider: 'none',
      accountNumber,
      bankCode,
      message: 'Please enter a valid 10-digit Nigerian NUBAN account number.',
    };
  }

  if (!/^[a-zA-Z0-9_-]{2,20}$/.test(bankCode)) {
    return {
      verified: false,
      verificationStatus: 'failed',
      provider: 'none',
      accountNumber,
      bankCode,
      message: 'Please select a valid bank.',
    };
  }

  const paystackKey = (process.env.PAYSTACK_SECRET_KEY || '').trim();
  const flutterwaveKey = (process.env.FLUTTERWAVE_SECRET_KEY || '').trim();

  if (paystackKey) {
    try {
      const url = `https://api.paystack.co/bank/resolve?account_number=${encodeURIComponent(
        accountNumber
      )}&bank_code=${encodeURIComponent(bankCode)}`;
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${paystackKey}` },
      });
      const json = (await resp.json().catch(() => ({}))) as {
        status?: boolean;
        message?: string;
        data?: { account_name?: string; account_number?: string };
      };
      if (resp.ok && json.status && json.data?.account_name) {
        return {
          verified: true,
          verificationStatus: 'verified',
          provider: 'paystack',
          accountNumber: json.data.account_number || accountNumber,
          bankCode,
          accountName: json.data.account_name.trim(),
          message: 'Account holder name verified via Paystack.',
        };
      }
      return {
        verified: false,
        verificationStatus: 'failed',
        provider: 'paystack',
        accountNumber,
        bankCode,
        message:
          json.message ||
          'Paystack could not verify that account number for the selected bank. Double-check details.',
      };
    } catch {
      return {
        verified: false,
        verificationStatus: 'failed',
        provider: 'paystack',
        accountNumber,
        bankCode,
        message: 'Paystack verification request failed temporarily. Admin review may still verify manually.',
      };
    }
  }

  if (flutterwaveKey) {
    try {
      const resp = await fetch('https://api.flutterwave.com/v3/accounts/resolve', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${flutterwaveKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          account_number: accountNumber,
          account_bank: bankCode,
        }),
      });
      const json = (await resp.json().catch(() => ({}))) as {
        status?: string;
        message?: string;
        data?: { account_name?: string; account_number?: string };
      };
      if (resp.ok && json.status === 'success' && json.data?.account_name) {
        return {
          verified: true,
          verificationStatus: 'verified',
          provider: 'flutterwave',
          accountNumber: json.data.account_number || accountNumber,
          bankCode,
          accountName: json.data.account_name.trim(),
          message: 'Account holder name verified via Flutterwave.',
        };
      }
      return {
        verified: false,
        verificationStatus: 'failed',
        provider: 'flutterwave',
        accountNumber,
        bankCode,
        message:
          json.message ||
          'Flutterwave could not verify that account number for the selected bank. Double-check details.',
      };
    } catch {
      return {
        verified: false,
        verificationStatus: 'failed',
        provider: 'flutterwave',
        accountNumber,
        bankCode,
        message: 'Flutterwave verification request failed temporarily. Admin review may still verify manually.',
      };
    }
  }

  return {
    verified: false,
    verificationStatus: 'not_configured',
    provider: 'none',
    accountNumber,
    bankCode,
    message:
      'Bank account auto-verification is not configured (set PAYSTACK_SECRET_KEY or FLUTTERWAVE_SECRET_KEY). Submission will require manual admin verification.',
  };
}
