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
  cardDeclinedAction: { tr: "Cihaz reddetti", en: "The terminal declined it" },
  waiting_card: { tr: "Kart cihazında ödeme bekleniyor…", en: "Waiting for the card terminal…" },
  waiting_cash: { tr: "Kart cihazında fiş kesiliyor…", en: "The terminal is printing the receipt…" },
  cardDeclined: { tr: "Kart reddedildi. Tekrar dene ya da nakit al.", en: "The card was declined. Try again or take cash." },
  terminalUnreachable: { tr: "Kart cihazına ulaşılamadı. Cihazı kontrol edip tekrar dene.", en: "Couldn't reach the card terminal. Check it and try again." },
  paymentClosed: { tr: "Bu ödeme kapandı. Tekrar dene.", en: "This payment was closed. Try again." },

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
  refundHelp: {
    tr: "Paranın tamamı ödendiği yolla geri verilir: nakitse çekmeceden, kartsa kart cihazından iade et.",
    en: "All of the money goes back the way it was paid: from the drawer for cash, on the card terminal for a card.",
  },
  refundWaiting: { tr: "İade kart cihazında bekliyor.", en: "The refund is waiting on the card terminal." },
  payments: { tr: "Ödemeler", en: "Payments" },
  refundLine: { tr: "İade", en: "Refund" },
  pay_pending: { tr: "Bekliyor", en: "Waiting" },
  pay_approved: { tr: "Onaylandı", en: "Approved" },
  pay_declined: { tr: "Reddedildi", en: "Declined" },
  pay_cancelled: { tr: "Vazgeçildi", en: "Cancelled" },
  approvalCode: { tr: "Onay", en: "Approval" },
  receiptNo: { tr: "Fiş", en: "Receipt" },
  deleteHelp: {
    tr: "Satışlardan ve raporlardan kalkar; kim, ne zaman ve neden sildiği kayıtta kalır.",
    en: "It leaves Sales and the reports; who deleted it, when and why stays on record.",
  },
  reason: { tr: "Sebep", en: "Reason" },
  reasonPlaceholder: { tr: "Örneğin: müşteri vazgeçti", en: "For example: the customer changed their mind" },
  voidedBy: { tr: "İptal eden", en: "Voided by" },
  refundedBy: { tr: "İade eden", en: "Refunded by" },

  signOut: { tr: "Kilitle", en: "Lock" },
  openScreen: { tr: "Müşteri ekranı", en: "Customer screen" },
  peniOnScreen: { tr: "Müşteri ekranında peni kodu", en: "Peni code on the customer screen" },

  // The customer screen
  yourOrder: { tr: "Siparişin", en: "Your order" },
  total: { tr: "Toplam", en: "Total" },
  thanks: { tr: "Teşekkürler!", en: "Thank you!" },
  paidByCash: { tr: "Nakitle ödendi", en: "Paid in cash" },
  paidByCard: { tr: "Kartla ödendi", en: "Paid by card" },
  takePeni: { tr: "Peni'ni al", en: "Take your peni" },
  scanHelp: {
    tr: "Peni uygulamasında Tara'ya dokun ve kodu okut. Ya da bu kodu yaz:",
    en: "In the Peni app, tap Scan and point it at the code. Or type this code:",
  },
  peniQr: { tr: "Peni almak için QR kod", en: "QR code to take your peni" },
  welcome: { tr: "Hoş geldin", en: "Welcome" },
  event: { tr: "Etkinlik", en: "Event" },
  fromTheCafe: { tr: "Kafeden", en: "From the café" },
  getPeni: { tr: "Peni'yi indir", en: "Get Peni" },
  getPeniBody: {
    tr: "Her kahvende peni biriktir, askıya kahve bırak, mahallenle tanış.",
    en: "Collect peni with every coffee, leave one on the askı, meet your neighbours.",
  },
  scanWithPhone: { tr: "Telefonunla okut", en: "Scan with your phone" },
  appQr: { tr: "Peni'yi indirmek için QR kod", en: "QR code to get Peni" },
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
