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
  peni: { tr: "Peni", en: "Peni" },

  // Spending peni at the till (piece 11)
  peniTitle: { tr: "Peniyle öde", en: "Pay with peni" },
  peniCodeHelp: {
    tr: "Müşteri Peni'de “Ödeme kodum”u açar. QR'ı okutun ya da 6 haneli kodu yazın.",
    en: "The customer opens “My payment code” in Peni. Scan the QR or type the 6-digit code.",
  },
  peniCode: { tr: "Ödeme kodu", en: "Payment code" },
  peniLook: { tr: "Cüzdanı aç", en: "Open the wallet" },
  peniBalance: { tr: "Bakiye", en: "Balance" },
  peniMax: { tr: "Bu siparişe en çok", en: "Most for this order" },
  peniAll: { tr: "Tamamı", en: "All of it" },
  peniAmount: { tr: "Düşülecek peni", en: "Peni to take" },
  peniTake: { tr: "Peniyi düş", en: "Take the peni" },
  peniNone: { tr: "Bu siparişe düşülecek peni yok.", en: "No peni can go on this order." },
  peniOnOrder: { tr: "Peni", en: "Peni" },
  peniGiveBack: { tr: "Geri ver", en: "Give back" },
  peniLocked: {
    tr: "Peni düşüldü. Siparişi değiştirmek için önce peniyi geri ver.",
    en: "Peni are on this order. Give them back before changing it.",
  },

  // Askıda kahve at the till (piece 13)
  askida: { tr: "Askı", en: "Askı" },
  askidaTitle: { tr: "Askıda kahve", en: "Askıda kahve" },
  askidaPool: { tr: "Askıda", en: "On the askı" },
  askidaHelp: {
    tr: "İsteyen herkes askıdan alabilir, hesap ya da sınır yok. Siparişteki ürün askıdan ödenir; misafir askıya bırakmak isterse ücretini siparişe ekle.",
    en: "Anyone who asks can take from the askı, no account and no limit. Items on the order are paid from the askı; a guest who wants to leave one adds it to their order.",
  },
  askidaFor: { tr: "{n} kişilik", en: "Enough for {n}" },
  askidaOnOrderCount: { tr: "Siparişte {n}", en: "{n} on the order" },
  askidaGive: { tr: "Askıdan ver", en: "Give from the askı" },
  askidaGiveN: { tr: "{n} tanesini askıdan ver", en: "Give {n} from the askı" },
  askidaHang: { tr: "Askıya bırak", en: "Leave on the askı" },
  askidaEmpty: { tr: "Askıda şu an bunun için yeterli peni yok.", en: "There isn't enough on the askı for this right now." },
  askidaOff: { tr: "Bu kafede askı kapalı. Ayarlar'dan açılabilir.", en: "The askı is off at this café. It can be turned on in Settings." },
  askidaOnOrder: { tr: "Askıdan", en: "From the askı" },
  askidaPutBack: { tr: "Askıya geri koy", en: "Put back" },
  askidaLocked: {
    tr: "Siparişte askıdan verilen ürün var. Değiştirmek için önce askıya geri koy.",
    en: "Items on this order came from the askı. Put them back before changing it.",
  },
  askidaUsed: { tr: "Askıdan ikram: {tl}", en: "A treat from the askı: {tl}" },
  paidByAskida: { tr: "Askıdan ikram", en: "A treat from the askı" },
  left: { tr: "Kalan", en: "Left to pay" },
  paidByPeni: { tr: "Peniyle ödendi", en: "Paid with peni" },
  peniUsed: { tr: "{n} peni kullanıldı", en: "{n} peni used" },
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

  // Kasa: the drawer
  drawer: { tr: "Kasa", en: "Drawer" },
  drawerOpen: { tr: "Kasa açık", en: "The drawer is open" },
  drawerClosed: { tr: "Kasa kapalı", en: "The drawer is closed" },
  drawerClosedSell: { tr: "Kasa kapalı. Nakit almak için önce kasayı aç.", en: "The drawer is closed. Open it before taking cash." },
  openDrawer: { tr: "Kasayı aç", en: "Open the drawer" },
  closeDrawer: { tr: "Kasayı kapat", en: "Close the drawer" },
  openedBy: { tr: "Açan", en: "Opened by" },
  closedBy: { tr: "Kapatan", en: "Closed by" },
  since: { tr: "Açılış", en: "Opened" },
  openingCount: { tr: "Açılış sayımı", en: "Opening count" },
  cashSales: { tr: "Nakit satış", en: "Cash sales" },
  cashRefunds: { tr: "Nakit iade", en: "Cash refunds" },
  putIn: { tr: "Konan", en: "Put in" },
  takenOut: { tr: "Alınan", en: "Taken out" },
  expected: { tr: "Kasada olması gereken", en: "Should be in the drawer" },
  cardTotal: { tr: "Kart toplamı", en: "Card total" },
  cardTotalHelp: { tr: "Kart cihazının gün sonu toplamıyla karşılaştır.", en: "Compare with the card terminal's end-of-day total." },
  moveIn: { tr: "Para koy", en: "Put cash in" },
  moveOut: { tr: "Para al", en: "Take cash out" },
  moveInTitle: { tr: "Kasaya para koy", en: "Put cash in the drawer" },
  moveOutTitle: { tr: "Kasadan para al", en: "Take cash out of the drawer" },
  movePlaceholderIn: { tr: "Örneğin: bankadan bozuk para", en: "For example: change from the bank" },
  movePlaceholderOut: { tr: "Örneğin: marketten süt", en: "For example: milk from the shop" },
  amount: { tr: "Tutar", en: "Amount" },
  save: { tr: "Kaydet", en: "Save" },
  moves: { tr: "Kasa hareketleri", en: "Cash moves" },
  noMoves: { tr: "Henüz para konmadı ya da alınmadı.", en: "No cash put in or taken out yet." },
  countTitleOpen: { tr: "Açılış sayımı", en: "Opening count" },
  countTitleClose: { tr: "Kapanış sayımı", en: "Closing count" },
  countHelp: { tr: "Her banknot ve bozuk paradan kaç tane var, yaz.", en: "Enter how many of each note and coin there are." },
  counted: { tr: "Sayılan", en: "Counted" },
  difference: { tr: "Fark", en: "Difference" },
  matches: { tr: "Tutuyor", en: "It matches" },
  firstOpening: { tr: "İlk açılış: sayılan tutar başlangıç olur.", en: "First opening: the count becomes the starting amount." },
  differenceReason: { tr: "Farkın sebebi", en: "Why it doesn't match" },
  differencePlaceholder: { tr: "Örneğin: bozuk para eksik çıktı", en: "For example: some coins were missing" },
  lastClosed: { tr: "Son kapanış", en: "Last closed" },
  neverOpened: { tr: "Kasa henüz hiç açılmadı.", en: "The drawer hasn't been opened yet." },
  more: { tr: "bir tane daha", en: "one more" },
  less: { tr: "bir tane az", en: "one less" },
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
    tr: "Telefonunun kamerasıyla QR'ı okut. Ya da bu kodu şu adreste yaz:",
    en: "Scan the QR with your phone's camera. Or type this code at:",
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
