import { PeniApiError } from "@peni/api";

/** The till's words in Turkish and English, both at launch. Turkish is the default. */
export type Lang = "tr" | "en";

const TEXT = {
  title: { tr: "Satış ekranı", en: "Till" },
  loading: { tr: "Açılıyor…", en: "Opening…" },
  retry: { tr: "Tekrar dene", en: "Try again" },
  cancel: { tr: "Vazgeç", en: "Cancel" },
  close: { tr: "Kapat", en: "Close" },
  darkOn: { tr: "Koyu tema", en: "Dark theme" },
  darkOff: { tr: "Açık tema", en: "Light theme" },

  // Setting a computer up as a till
  setupTitle: { tr: "Bu bilgisayarı satış ekranı yap", en: "Make this computer a till" },
  setupBody: {
    tr: "Kafenin sahibi bir kez giriş yapar. Sonra ekip bu bilgisayarda yalnızca adına dokunup PIN'ini yazar.",
    en: "The café's owner signs in once. After that, the team taps their name and types their PIN on this computer.",
  },
  email: { tr: "E-posta", en: "Email" },
  password: { tr: "Şifre", en: "Password" },
  deviceName: { tr: "Bu bilgisayarın adı", en: "Name for this computer" },
  deviceNameDefault: { tr: "Kasa", en: "Till" },
  whichCafe: { tr: "Hangi kafe?", en: "Which café?" },
  signIn: { tr: "Giriş yap", en: "Sign in" },
  makeTill: { tr: "Satış ekranı yap", en: "Make it a till" },
  notOwner: { tr: "Bilgisayarı yalnızca kafenin sahibi kurabilir.", en: "Only the café's owner can set up a till." },

  // Signing in at the till
  whoIsHere: { tr: "Kim çalışıyor?", en: "Who's working?" },
  tapYourName: { tr: "Adına dokun, PIN'ini yaz.", en: "Tap your name, then type your PIN." },
  noPinYet: { tr: "PIN yok", en: "No PIN" },
  locked: { tr: "Bir süre kilitli", en: "Locked for a while" },
  noPinHelp: {
    tr: "PIN'i olmayanlar önce kendi telefonundan ya da bilgisayarından şifreyle girip PIN belirler.",
    en: "Anyone without a PIN sets one first, signing in with their password on their own phone or computer.",
  },
  typePin: { tr: "PIN'ini yaz", en: "Type your PIN" },
  back: { tr: "Geri", en: "Back" },
  erase: { tr: "Sil", en: "Delete" },
  ok: { tr: "Tamam", en: "OK" },

  // Selling
  order: { tr: "Sipariş", en: "Order" },
  clear: { tr: "Temizle", en: "Clear" },
  emptyOrder: { tr: "Ürünlere dokunarak siparişi başlat.", en: "Tap products to start an order." },
  emptyMenu: {
    tr: "Satışta ürün yok. Menü'den ürün ekleyip açınca burada görünür.",
    en: "Nothing is on sale. Products appear here once they're added and switched on in Menu.",
  },
  photo: { tr: "Fotoğraf", en: "Photo" },
  addOne: { tr: "bir tane ekle", en: "add one" },
  removeOne: { tr: "bir tane azalt", en: "remove one" },
  subtotal: { tr: "Ara toplam", en: "Subtotal" },
  discount: { tr: "İndirim", en: "Discount" },
  orderDiscount: { tr: "Sipariş indirimi", en: "Order discount" },
  lineDiscount: { tr: "Ürün indirimi", en: "Item discount" },
  noDiscount: { tr: "Yok", en: "None" },
  otherPercent: { tr: "Diğer", en: "Other" },
  due: { tr: "Ödenecek", en: "To pay" },
  cash: { tr: "Nakit", en: "Cash" },
  card: { tr: "Kart", en: "Card" },
  each: { tr: "tanesi", en: "each" },
  pricesChanged: {
    tr: "Menüde fiyat değişmiş. Toplamı kontrol edip tekrar dokun.",
    en: "A price changed on the menu. Check the total and tap again.",
  },

  cashTitle: { tr: "Nakit ödeme", en: "Cash payment" },
  handedOver: { tr: "Verilen", en: "Handed over" },
  change: { tr: "Para üstü", en: "Change" },
  exact: { tr: "Tam para", en: "Exact amount" },
  takeCash: { tr: "Ödemeyi al", en: "Take payment" },
  tooLittle: { tr: "Toplamdan az", en: "Less than the total" },

  cardTitle: { tr: "Kart ödemesi", en: "Card payment" },
  cardBody: {
    tr: "Tutarı kart cihazına gir ve ödemeyi al. Cihaz onaylayınca buraya dokun.",
    en: "Enter the amount on the card terminal and take the payment. Tap here once the terminal approves it.",
  },
  cardDone: { tr: "Kart ödemesi alındı", en: "Card payment approved" },

  paid: { tr: "Ödendi", en: "Paid" },
  newOrder: { tr: "Yeni sipariş", en: "New order" },
  changeToGive: { tr: "Para üstü", en: "Change to give" },

  // Sales list
  sales: { tr: "Satışlar", en: "Sales" },
  backToTill: { tr: "Satışa dön", en: "Back to the till" },
  today: { tr: "Bugün", en: "Today" },
  prevDay: { tr: "Önceki gün", en: "Previous day" },
  nextDay: { tr: "Sonraki gün", en: "Next day" },
  sumSales: { tr: "Satış", en: "Sales" },
  sumOrders: { tr: "sipariş", en: "orders" },
  sumOrder1: { tr: "sipariş", en: "order" },
  sumRefunds: { tr: "İade", en: "Refunds" },
  sumVoided: { tr: "İptal", en: "Voided" },
  all: { tr: "Hepsi", en: "All" },
  noSales: { tr: "Bu gün satış yok.", en: "No sales on this day." },
  items: { tr: "ürün", en: "items" },
  item1: { tr: "ürün", en: "item" },
  takenBy: { tr: "Alan", en: "Taken by" },

  status_open: { tr: "Açık", en: "Open" },
  status_paid: { tr: "Ödendi", en: "Paid" },
  status_voided: { tr: "İptal", en: "Voided" },
  status_refunded: { tr: "İade", en: "Refunded" },

  voidAction: { tr: "İptal et", en: "Void" },
  refundAction: { tr: "İade et", en: "Refund" },
  deleteAction: { tr: "Sil", en: "Delete" },
  voidHelp: { tr: "Ödenmemiş sipariş kapanır. Satışlarda iptal olarak kalır.", en: "The unpaid order closes. It stays in Sales as voided." },
  refundHelp: { tr: "Paranın tamamı ödendiği yolla geri verilir.", en: "All of the money goes back the way it was paid." },
  deleteHelp: {
    tr: "Satışlardan ve raporlardan kalkar; kim, ne zaman ve neden sildiği kayıtta kalır.",
    en: "It leaves Sales and the reports; who deleted it, when and why stays on record.",
  },
  reason: { tr: "Sebep", en: "Reason" },
  reasonPlaceholder: { tr: "Örneğin: müşteri vazgeçti", en: "For example: the customer changed their mind" },
  voidedBy: { tr: "İptal eden", en: "Voided by" },
  refundedBy: { tr: "İade eden", en: "Refunded by" },

  signOut: { tr: "Kilitle", en: "Lock" },
  role_owner: { tr: "Sahip", en: "Owner" },
  role_manager: { tr: "Müdür", en: "Manager" },
  role_chef: { tr: "Şef", en: "Chef" },
  role_barista: { tr: "Barista", en: "Barista" },
} as const;

export type TextKey = keyof typeof TEXT;

export function text(lang: Lang) {
  return (key: TextKey) => TEXT[key][lang];
}

export type T = ReturnType<typeof text>;

/** What to show for a failed call: the Turkish copy, or the server's English message. */
export function errorText(error: unknown, lang: Lang): string {
  if (error instanceof PeniApiError) return lang === "tr" ? error.message : error.serverMessage;
  return lang === "tr" ? "Bir şeyler ters gitti. Tekrar dene." : "Something went wrong. Try again.";
}
