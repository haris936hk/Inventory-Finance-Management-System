/**
 * Financial Report Service
 *
 * Generates financial reports from the simplified double-entry accounting system:
 * - Balance Sheet (Assets, Liabilities, Equity)
 * - Profit & Loss Statement (Income - Expenses)
 * - Tax Summary (Sales Tax collected vs Input Tax paid)
 */

const db = require('../config/database');
const logger = require('../config/logger');
const { formatAmount } = require('../utils/transactionWrapper');

class FinancialReportService {
  /**
   * Generate Balance Sheet report
   * Shows financial position at a specific date
   *
   * @param {Date} asOfDate - Report as of this date (default: today)
   * @returns {Promise<Object>} Balance sheet with assets, liabilities, equity
   */
  static async getBalanceSheet(asOfDate = new Date()) {
    try {
      // Get all accounts with their current balances
      const accounts = await db.prisma.account.findMany({
        where: {
          deletedAt: null
        },
        select: {
          id: true,
          code: true,
          name: true,
          type: true,
          currentBalance: true
        },
        orderBy: {
          code: 'asc'
        }
      });

      // Group accounts by type
      const assets = accounts.filter(a => a.type === 'Asset');
      const liabilities = accounts.filter(a => a.type === 'Liability');
      const equity = accounts.filter(a => a.type === 'Equity');

      // Calculate totals
      const totalAssets = assets.reduce((sum, a) => sum + parseFloat(a.currentBalance), 0);
      const totalLiabilities = liabilities.reduce((sum, a) => sum + parseFloat(a.currentBalance), 0);
      const totalEquity = equity.reduce((sum, a) => sum + parseFloat(a.currentBalance), 0);

      // Calculate Retained Earnings from Income - Expenses
      const income = accounts.filter(a => a.type === 'Income');
      const expenses = accounts.filter(a => a.type === 'Expense');

      const totalIncome = income.reduce((sum, a) => sum + parseFloat(a.currentBalance), 0);
      const totalExpenses = expenses.reduce((sum, a) => sum + parseFloat(a.currentBalance), 0);
      const retainedEarnings = totalIncome - totalExpenses;

      // Net Equity (includes retained earnings)
      const netEquity = totalEquity + retainedEarnings;

      // Balance check: Assets = Liabilities + Equity
      const balanceDifference = totalAssets - (totalLiabilities + netEquity);
      const isBalanced = Math.abs(balanceDifference) < 0.01; // Allow 1 cent tolerance

      return {
        asOfDate,
        assets: {
          accounts: assets.map(a => ({
            code: a.code,
            name: a.name,
            balance: formatAmount(parseFloat(a.currentBalance))
          })),
          total: formatAmount(totalAssets)
        },
        liabilities: {
          accounts: liabilities.map(a => ({
            code: a.code,
            name: a.name,
            balance: formatAmount(parseFloat(a.currentBalance))
          })),
          total: formatAmount(totalLiabilities)
        },
        equity: {
          accounts: [
            ...equity.map(a => ({
              code: a.code,
              name: a.name,
              balance: formatAmount(parseFloat(a.currentBalance))
            })),
            {
              code: 'RETAINED',
              name: 'Retained Earnings (Net Profit)',
              balance: formatAmount(retainedEarnings)
            }
          ],
          total: formatAmount(netEquity)
        },
        totals: {
          assets: formatAmount(totalAssets),
          liabilitiesAndEquity: formatAmount(totalLiabilities + netEquity),
          difference: formatAmount(balanceDifference),
          isBalanced
        }
      };
    } catch (error) {
      logger.error('Error generating balance sheet', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Generate Profit & Loss Statement
   * Shows income and expenses for a period
   *
   * @param {Date} startDate - Period start date
   * @param {Date} endDate - Period end date (default: today)
   * @returns {Promise<Object>} P&L with revenue, expenses, profit
   */
  static async getProfitAndLoss(startDate, endDate = new Date()) {
    try {
      // Get all income and expense accounts
      const accounts = await db.prisma.account.findMany({
        where: {
          deletedAt: null,
          type: {
            in: ['Income', 'Expense']
          }
        },
        select: {
          id: true,
          code: true,
          name: true,
          type: true,
          currentBalance: true,
          openingBalance: true
        },
        orderBy: {
          code: 'asc'
        }
      });

      // Separate income and expenses
      const incomeAccounts = accounts.filter(a => a.type === 'Income');
      const expenseAccounts = accounts.filter(a => a.type === 'Expense');

      // Calculate totals
      const totalRevenue = incomeAccounts.reduce((sum, a) =>
        sum + parseFloat(a.currentBalance), 0
      );

      const totalExpenses = expenseAccounts.reduce((sum, a) =>
        sum + parseFloat(a.currentBalance), 0
      );

      const grossProfit = totalRevenue;
      const netProfit = totalRevenue - totalExpenses;
      const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

      return {
        period: {
          startDate,
          endDate
        },
        revenue: {
          accounts: incomeAccounts.map(a => ({
            code: a.code,
            name: a.name,
            amount: formatAmount(parseFloat(a.currentBalance))
          })),
          total: formatAmount(totalRevenue)
        },
        expenses: {
          accounts: expenseAccounts.map(a => ({
            code: a.code,
            name: a.name,
            amount: formatAmount(parseFloat(a.currentBalance))
          })),
          total: formatAmount(totalExpenses)
        },
        summary: {
          revenue: formatAmount(totalRevenue),
          expenses: formatAmount(totalExpenses),
          grossProfit: formatAmount(grossProfit),
          netProfit: formatAmount(netProfit),
          profitMargin: formatAmount(profitMargin)
        }
      };
    } catch (error) {
      logger.error('Error generating P&L statement', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Generate Tax Summary Report (Pakistan GST)
   * Shows sales tax collected vs input tax paid
   *
   * @param {Date} startDate - Period start date
   * @param {Date} endDate - Period end date (default: today)
   * @returns {Promise<Object>} Tax summary with payable/receivable amounts
   */
  static async getTaxSummary(startDate, endDate = new Date()) {
    try {
      // Get sales tax payable account (tax collected from customers)
      const salesTaxAccount = await db.prisma.account.findUnique({
        where: { code: '2100' },
        select: {
          id: true,
          code: true,
          name: true,
          currentBalance: true
        }
      });

      // Get input tax receivable account (tax paid to vendors)
      const inputTaxAccount = await db.prisma.account.findUnique({
        where: { code: '1210' },
        select: {
          id: true,
          code: true,
          name: true,
          currentBalance: true
        }
      });

      const salesTaxCollected = salesTaxAccount
        ? parseFloat(salesTaxAccount.currentBalance)
        : 0;

      const inputTaxPaid = inputTaxAccount
        ? parseFloat(inputTaxAccount.currentBalance)
        : 0;

      // Net tax payable = Sales Tax Collected - Input Tax Paid
      const netTaxPayable = salesTaxCollected - inputTaxPaid;

      // Get journal entries for the period to show details
      const salesTaxEntries = salesTaxAccount ? await db.prisma.journalEntry.findMany({
        where: {
          accountId: salesTaxAccount.id,
          entryDate: {
            gte: startDate,
            lte: endDate
          },
          deletedAt: null
        },
        select: {
          entryDate: true,
          reference: true,
          description: true,
          credit: true,
          debit: true
        },
        orderBy: { entryDate: 'desc' },
        take: 50
      }) : [];

      const inputTaxEntries = inputTaxAccount ? await db.prisma.journalEntry.findMany({
        where: {
          accountId: inputTaxAccount.id,
          entryDate: {
            gte: startDate,
            lte: endDate
          },
          deletedAt: null
        },
        select: {
          entryDate: true,
          reference: true,
          description: true,
          debit: true,
          credit: true
        },
        orderBy: { entryDate: 'desc' },
        take: 50
      }) : [];

      return {
        period: {
          startDate,
          endDate
        },
        summary: {
          salesTaxCollected: formatAmount(salesTaxCollected),
          inputTaxPaid: formatAmount(inputTaxPaid),
          netTaxPayable: formatAmount(netTaxPayable),
          status: netTaxPayable > 0 ? 'Payable to FBR' : 'Receivable from FBR'
        },
        details: {
          salesTax: {
            accountName: salesTaxAccount?.name || 'Sales Tax Payable',
            totalCollected: formatAmount(salesTaxCollected),
            recentTransactions: salesTaxEntries.map(e => ({
              date: e.entryDate,
              reference: e.reference,
              description: e.description,
              amount: formatAmount(parseFloat(e.credit) - parseFloat(e.debit))
            }))
          },
          inputTax: {
            accountName: inputTaxAccount?.name || 'Input Tax Receivable',
            totalPaid: formatAmount(inputTaxPaid),
            recentTransactions: inputTaxEntries.map(e => ({
              date: e.entryDate,
              reference: e.reference,
              description: e.description,
              amount: formatAmount(parseFloat(e.debit) - parseFloat(e.credit))
            }))
          }
        }
      };
    } catch (error) {
      logger.error('Error generating tax summary', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Get trial balance (all accounts with their balances)
   * Useful for verifying that debits = credits
   *
   * @param {Date} asOfDate - Report as of this date (default: today)
   * @returns {Promise<Object>} Trial balance
   */
  static async getTrialBalance(asOfDate = new Date()) {
    try {
      const accounts = await db.prisma.account.findMany({
        where: {
          deletedAt: null
        },
        select: {
          code: true,
          name: true,
          type: true,
          currentBalance: true
        },
        orderBy: {
          code: 'asc'
        }
      });

      // Calculate debit and credit totals based on account type
      let totalDebits = 0;
      let totalCredits = 0;

      const accountsWithDebitCredit = accounts.map(account => {
        const balance = parseFloat(account.currentBalance);
        let debit = 0;
        let credit = 0;

        // Assets and Expenses have debit balances
        if (['Asset', 'Expense'].includes(account.type)) {
          debit = balance;
          totalDebits += balance;
        }
        // Liabilities, Income, Equity have credit balances
        else {
          credit = balance;
          totalCredits += balance;
        }

        return {
          code: account.code,
          name: account.name,
          type: account.type,
          debit: formatAmount(debit),
          credit: formatAmount(credit)
        };
      });

      const difference = totalDebits - totalCredits;
      const isBalanced = Math.abs(difference) < 0.01;

      return {
        asOfDate,
        accounts: accountsWithDebitCredit,
        totals: {
          debits: formatAmount(totalDebits),
          credits: formatAmount(totalCredits),
          difference: formatAmount(difference),
          isBalanced
        }
      };
    } catch (error) {
      logger.error('Error generating trial balance', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
}

module.exports = FinancialReportService;
