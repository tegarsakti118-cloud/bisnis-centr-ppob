const DB_KEY = 'sakapay_local_db_v1';

const defaultData = {
  accounts: [
    { id: 'acc_1', name: 'Kas Tunai', balance: 500000 },
    { id: 'acc_2', name: 'BRI', balance: 1500000 },
    { id: 'acc_3', name: 'SeaBank', balance: 750000 },
    { id: 'acc_4', name: 'Digipos / PPOB', balance: 1200000 }
  ],
  transactions: [],
  expenses: [],
  customers: [],
  debts: [],
  vouchers: [
    {
      id: 'vouch_1',
      name: 'Telkomsel 7GB / 7 Hari',
      modal_saldo: 14987,
      modal_fisik: 300,
      price: 20000,
      stock: 9
    }
  ]
};

function getAppData() {
  const data = localStorage.getItem(DB_KEY);
  if (!data) {
    localStorage.setItem(DB_KEY, JSON.stringify(defaultData));
    return defaultData;
  }
  return JSON.parse(data);
}

function saveAppData(data) {
  localStorage.setItem(DB_KEY, JSON.stringify(data));
}

function formatRupiah(number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(number);
}
