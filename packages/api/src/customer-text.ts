import { PeniApiError } from "./client";

/**
 * The customer side's words in Turkish and English, shared by the web pages and the app.
 * Turkish is the default.
 */
export type Lang = "tr" | "en";

const TEXT = {
  loading: { tr: "Açılıyor…", en: "Opening…" },
  waiting: { tr: "seni bekliyor", en: "waiting for you" },
  waitingBody: {
    tr: "Bu alışverişten kazandığın penny. Gün sonuna kadar alabilirsin; sonra kod kapanır.",
    en: "What this purchase earned you. Take it before the day ends; the code closes then.",
  },
  take: { tr: "Penny'yi al", en: "Take the pennies" },
  taking: { tr: "Alınıyor…", en: "Taking…" },
  yours: { tr: "hesabına geçti", en: "is in your account" },
  balance: { tr: "Bu kafedeki bakiyen", en: "Your balance at this café" },
  joined: { tr: "Kafeye de katıldın. Üyelik ücretsiz.", en: "You've joined the café too. It's free." },
  spendHint: {
    tr: "Bir sonraki siparişte kasada ödeme kodunu göster, istediğin kadarını harca.",
    en: "Show your payment code at the till next time and spend as much as you like.",
  },
  mySpendCode: { tr: "Ödeme kodum", en: "My payment code" },

  // Ödeme kodum (piece 11)
  spendTitle: { tr: "Ödeme kodun", en: "Your payment code" },
  spendHelp: {
    tr: "Kasada bu QR'ı okut ya da kodu söyle. Ne kadar penny harcayacağını kasada söylersin.",
    en: "Let the till scan this QR, or read out the code. Say at the till how many pennies to spend.",
  },
  spendValid: { tr: "Kalan süre", en: "Valid for" },
  spendRenew: { tr: "Yeni kod al", en: "Get a new code" },
  spendWhichCafe: { tr: "Hangi kafede ödüyorsun?", en: "Where are you paying?" },
  spendNoCafe: {
    tr: "Henüz bir kafeye üye değilsin. Bir alışverişin penny'sini aldığında kafeye katılırsın.",
    en: "You're not a member of any café yet. Taking the pennies from a purchase makes you one.",
  },
  otherCafe: { tr: "Başka bir kafe", en: "Another café" },
  signInToSpend: { tr: "Penny harcamak için giriş yap.", en: "Sign in to spend pennies." },
  taken: { tr: "Bu penny başka bir hesaba geçmiş.", en: "These pennies went to another account." },
  takenBody: { tr: "Sen almadıysan kasaya sorabilirsin.", en: "If it wasn't you, ask at the till." },
  expired: { tr: "Bu kodun süresi doldu.", en: "This code has closed." },
  expiredBody: { tr: "Penny kodları gün sonunda kapanır.", en: "Penny codes close at the end of the day." },
  cancelled: { tr: "Bu satış iade edildi.", en: "This sale was refunded." },
  cancelledBody: { tr: "İade edilen satışın penny'si alınamaz.", en: "A refunded sale earns no pennies." },
  notFound: { tr: "Bu penny kodu bulunamadı.", en: "We couldn't find this penny code." },

  // Ismarlama (piece 12). {name}, {n} and {h} are filled in with fill().
  treats: { tr: "Ismarlamalar", en: "Treats" },
  treatSomeone: { tr: "Birine ısmarla", en: "Treat someone" },
  treatWhichCafe: { tr: "Hangi kafede ısmarlıyorsun?", en: "At which café?" },
  treatWho: { tr: "Kime ısmarlıyorsun?", en: "Who are you treating?" },
  treatOnlyHere: {
    tr: "Penny yalnız bu kafede geçer; bu yüzden kafenin üyelerine ısmarlayabilirsin.",
    en: "Pennies only work at this café, so you can treat its members.",
  },
  recents: { tr: "Son ısmarladıkların", en: "People you treated" },
  byList: { tr: "Üyeler", en: "Members" },
  byCode: { tr: "Penny kodu", en: "Penny code" },
  byPhone: { tr: "Telefon", en: "Phone" },
  searchMembers: { tr: "İsimle ara", en: "Search by name" },
  noMembers: { tr: "Profilini gösteren üye bulunamadı.", en: "No members who show their profile." },
  listHelp: {
    tr: "Listede yalnız profilini gösteren üyeler var. Arkadaşın yoksa Penny kodunu sor.",
    en: "Only members who show their profile are listed. If your friend isn't here, ask for their Penny code.",
  },
  codeHelpTreat: {
    tr: "Arkadaşının Penny kodu, kendi Ismarlamalar sayfasında yazar.",
    en: "Your friend's Penny code is on their own Treats page.",
  },
  phoneNumber: { tr: "Telefon numarası", en: "Phone number" },
  find: { tr: "Bul", en: "Find" },
  change: { tr: "Değiştir", en: "Change" },
  howMuch: { tr: "Kaç penny?", en: "How many pennies?" },
  yourBalance: { tr: "Bakiyen", en: "Your balance" },
  other: { tr: "Başka", en: "Other" },
  note: { tr: "Not (isteğe bağlı)", en: "Note (optional)" },
  notePlaceholder: { tr: "Afiyet olsun!", en: "Enjoy!" },
  treat: { tr: "Ismarla", en: "Treat" },
  treatTo: { tr: "{name} {n} penny ısmarla", en: "Treat {name} to {n} pennies" },
  sent: { tr: "{name} {n} penny ısmarladın", en: "You treated {name} to {n} pennies" },
  sentBody: {
    tr: "Kabul edince penny onun hesabına geçer. {h} saat içinde kabul edilmezse sana geri döner.",
    en: "They get the pennies when they accept. If not accepted within {h} hours, the pennies come back to you.",
  },
  shareHelp: { tr: "Bağlantıyı gönder, haberi olsun.", en: "Send them the link so they know." },
  share: { tr: "Bağlantıyı paylaş", en: "Share the link" },
  copied: { tr: "Bağlantı kopyalandı", en: "Link copied" },
  shareText: { tr: "Sana {n} penny ısmarladım", en: "I treated you to {n} pennies" },
  takeBack: { tr: "Geri al", en: "Take back" },
  takenBack: { tr: "Geri aldın; penny bakiyene döndü.", en: "Taken back; the pennies are in your balance again." },
  treatAnother: { tr: "Başka birine ısmarla", en: "Treat someone else" },
  signInToTreat: { tr: "Ismarlamak için giriş yap.", en: "Sign in to treat someone." },
  treatNoCafe: {
    tr: "Henüz bir kafeye üye değilsin. Bir alışverişin penny'sini aldığında kafeye katılırsın.",
    en: "You're not a member of any café yet. Taking the pennies from a purchase makes you one.",
  },

  // One treat, by its link
  treatedYou: { tr: "{name} sana ısmarladı", en: "{name} treated you" },
  treatedSomeone: { tr: "{name} bir arkadaşına ısmarladı", en: "{name} treated a friend" },
  ifForYou: { tr: "Senin içinse giriş yap, sonra kabul et.", en: "If it's for you, sign in, then accept it." },
  acceptBy: { tr: "Son kabul", en: "Accept by" },
  accept: { tr: "Kabul et", en: "Accept" },
  accepting: { tr: "Kabul ediliyor…", en: "Accepting…" },
  decline: { tr: "İstemiyorum", en: "No, thanks" },
  inYourAccount: { tr: "hesabına geçti", en: "is in your account" },
  declinedBody: { tr: "Penny gönderene geri döndü.", en: "The pennies went back to the sender." },
  thank: { tr: "Teşekkür et", en: "Say thanks" },
  thanked: { tr: "Teşekkür ettin", en: "You said thanks" },
  theyThanked: { tr: "{name} teşekkür etti", en: "{name} said thanks" },
  notForYou: { tr: "Bu ısmarlama başka biri için.", en: "This treat is for someone else." },
  treatGone: { tr: "Bu ısmarlama artık açık değil.", en: "This treat isn't open any more." },
  treatNotFound: { tr: "Bu ısmarlama bulunamadı.", en: "We couldn't find this treat." },
  myTreats: { tr: "Ismarlamalarım", en: "My treats" },

  // Ismarlamalar list
  waitingForYou: { tr: "Seni bekleyenler", en: "Waiting for you" },
  earlier: { tr: "Geçmiş", en: "Earlier" },
  noTreats: { tr: "Henüz ısmarlama yok.", en: "No treats yet." },
  yourCode: { tr: "Penny kodun", en: "Your Penny code" },
  yourCodeHelp: { tr: "Sana ısmarlamak isteyen bu kodu kullanabilir.", en: "Friends can use it to treat you." },
  inPending: { tr: "Seni bekliyor", en: "Waiting for you" },
  inAccepted: { tr: "Kabul ettin", en: "Accepted" },
  inDeclined: { tr: "İstemedin", en: "Declined" },
  inExpired: { tr: "Süresi doldu", en: "Ran out" },
  outPending: { tr: "Kabul bekleniyor", en: "Not accepted yet" },
  outAccepted: { tr: "Kabul etti", en: "Accepted" },
  outDeclined: { tr: "İstemedi, sana döndü", en: "Declined, came back to you" },
  outCancelled: { tr: "Geri aldın", en: "Taken back" },
  outExpired: { tr: "Süresi doldu, sana döndü", en: "Ran out, came back to you" },
  from: { tr: "Gönderen", en: "From" },
  to: { tr: "Alan", en: "To" },

  // Askıda kahve (piece 13)
  askidaTitle: { tr: "Askıda kahve", en: "Askıda kahve" },
  askidaWaiting: { tr: "Askıda {goods} var", en: "{goods} waiting on the askı" },
  askidaNothing: { tr: "Askı şu an boş", en: "The askı is empty right now" },
  askidaPeni: { tr: "Askıda {n} penny", en: "{n} pennies on the askı" },
  askidaHow: {
    tr: "Kasada isteyen herkes askıdan alabilir. Hesap ya da sınır yok; birinin bıraktığını ihtiyacı olan alır.",
    en: "Anyone can ask for one at the till. No account, no limit: what someone leaves goes to whoever needs it.",
  },
  askidaWeek: { tr: "Son 7 günde askıdan {n} ikram", en: "{n} treats from the askı in the last 7 days" },
  askidaOff: { tr: "Bu kafede askı kapalı.", en: "This café has no askı." },
  askidaLeave: { tr: "Askıya bırak", en: "Leave some on the askı" },
  askidaLeaveN: { tr: "Askıya {n} penny bırak", en: "Leave {n} pennies on the askı" },
  askidaShowName: { tr: "Adım duvarda görünsün", en: "Show my name on the wall" },
  askidaMatch: { tr: "Kafe her bırakılana %{n} ekliyor.", en: "The café adds {n}% to everything left." },
  askidaLeft: { tr: "Askıya {n} penny bıraktın. Teşekkürler!", en: "You left {n} pennies on the askı. Thank you!" },
  askidaMatched: { tr: "Kafe de {n} penny ekledi.", en: "The café added {n} pennies too." },
  askidaAtTill: {
    tr: "Kasada nakit ya da kartla da bırakabilirsin: siparişine “Askıya çay” ekletmen yeter.",
    en: "You can also leave one at the till with cash or card: just ask for “Askıya çay” on your order.",
  },
  askidaSignIn: { tr: "Penny'nle askıya bırakmak için giriş yap.", en: "Sign in to leave pennies on the askı." },
  askidaNoPeni: {
    tr: "Bu kafede henüz penny'n yok. Bir alışverişin penny'sini aldığında buradan askıya bırakabilirsin.",
    en: "You have no pennies at this café yet. Once you take the pennies from a purchase, you can leave some here.",
  },
  askidaWall: { tr: "Askı duvarı", en: "The askı wall" },
  wallDonation: { tr: "{name} {n} penny bıraktı", en: "{name} left {n} pennies" },
  wallSomeone: { tr: "Bir üye", en: "A member" },
  wallTill: { tr: "Kasada {n} penny bırakıldı", en: "{n} pennies left at the till" },
  wallMatch: { tr: "Kafe {n} penny ekledi", en: "The café added {n} pennies" },
  wallEmpty: { tr: "Henüz kimse bırakmadı. İlk sen ol.", en: "Nobody has left any yet. Be the first." },

  // The café's page and its feed (piece 14)
  yourPeni: { tr: "Bu kafedeki penny'n", en: "Your pennies here" },
  payWithPeni: { tr: "Ödeme kodum", en: "My payment code" },
  treatSomeoneHere: { tr: "Ismarla", en: "Treat someone" },
  joinCafe: { tr: "Kafeye katıl", en: "Join the café" },
  joinHelp: {
    tr: "Üyelik ücretsiz. Katılınca beğenip yorum yazabilir, alışverişlerinden penny biriktirirsin.",
    en: "It's free. Members like and comment, and collect pennies with every purchase.",
  },
  signInToJoin: { tr: "Beğenmek ve yorum yazmak için giriş yap.", en: "Sign in to like and comment." },
  askidaLink: { tr: "Askıda {goods} var", en: "{goods} on the askı" },
  askidaLinkEmpty: { tr: "Askıda kahve", en: "Askıda kahve" },
  fromCafe: { tr: "Kafeden", en: "From the café" },
  noFeed: { tr: "Kafe henüz bir şey paylaşmadı.", en: "The café hasn't posted anything yet." },
  pinnedPost: { tr: "Sabit", en: "Pinned" },
  questionOfDay: { tr: "Günün sorusu", en: "Question of the day" },
  eventLabel: { tr: "Etkinlik", en: "Event" },
  like: { tr: "Beğen", en: "Like" },
  unlike: { tr: "Beğenmekten vazgeç", en: "Unlike" },
  likes: { tr: "{n} beğeni", en: "{n} likes" },
  commentsN: { tr: "{n} yorum", en: "{n} comments" },
  writeComment: { tr: "Yorum yaz", en: "Write a comment" },
  writeAnswer: { tr: "Cevabını yaz", en: "Write your answer" },
  answeredToday: { tr: "Bugünkü cevabın masada.", en: "Your answer for today is in." },
  sendComment: { tr: "Gönder", en: "Send" },
  deleteComment: { tr: "Sil", en: "Delete" },
  join: { tr: "Katıl", en: "Join" },
  goingYes: { tr: "Katılıyorsun", en: "You're going" },
  goingN: { tr: "{n} kişi katılıyor", en: "{n} going" },
  goingOfN: { tr: "{n}/{max} kişi katılıyor", en: "{n} of {max} going" },
  photoN: { tr: "Fotoğraf {n}", en: "Photo {n}" },
  close: { tr: "Kapat", en: "Close" },

  // Members' events and reports (piece 15)
  openEvent: { tr: "Etkinlik aç", en: "Open an event" },
  openEventHelp: {
    tr: "Burada kitap okuyacak, oyun oynayacak ya da bir konuyu konuşacaksan yaz; isteyen katılır.",
    en: "Reading here, playing a game, or keen to talk something over? Say when, and whoever likes can join.",
  },
  eventTitle: { tr: "Ne yapacaksın?", en: "What's the plan?" },
  eventTitleHint: { tr: "Ör. Bu kitabı okuyacağım, gelen olursa konuşuruz", en: "e.g. I'll be reading this book, join if you like" },
  eventWhen: { tr: "Ne zaman?", en: "When?" },
  eventCapacity: { tr: "En çok kaç kişi?", en: "How many people at most?" },
  eventCapacityHelp: { tr: "Boş bırakırsan sınır yok. Sen de bu sayıya dahilsin.", en: "Leave it empty for no limit. You count too." },
  eventBody: { tr: "Birkaç kelime daha", en: "A few more words" },
  optional: { tr: "isteğe bağlı", en: "optional" },
  eventOpenSubmit: { tr: "Etkinliği aç", en: "Open it" },
  eventSave: { tr: "Kaydet", en: "Save" },
  editEvent: { tr: "Düzenle", en: "Edit" },
  editEventTitle: { tr: "Etkinliğin", en: "Your event" },
  cancelEvent: { tr: "İptal et", en: "Call it off" },
  cancelEventTitle: { tr: "Etkinlik iptal olsun mu?", en: "Call the event off?" },
  cancelEventBody: {
    tr: "Akıştan kalkar ve katılanların listesinden düşer. Gelecek olanlara ayrıca haber vermek isteyebilirsin.",
    en: "It leaves the feed and the lists of the people going. You may want to tell them yourself.",
  },
  cancelEventYes: { tr: "Evet, iptal et", en: "Yes, call it off" },
  keepEvent: { tr: "Vazgeç", en: "Keep it" },
  hostedBy: { tr: "Açan: {name}", en: "Opened by {name}" },
  hostedByYou: { tr: "Senin etkinliğin", en: "Your event" },
  report: { tr: "Şikâyet et", en: "Report" },
  reported: { tr: "Şikâyet ettin", en: "You reported this" },
  reportTitle: { tr: "Neden şikâyet ediyorsun?", en: "What's wrong with it?" },
  reportHelp: {
    tr: "Kafenin ekibine gider. Yazan kişi kimin şikâyet ettiğini görmez.",
    en: "It goes to the café's team. Whoever wrote it won't see who reported it.",
  },
  reasonSpam: { tr: "Reklam ya da spam", en: "Ads or spam" },
  reasonRude: { tr: "Kaba ya da kırıcı", en: "Rude or hurtful" },
  reasonUnsafe: { tr: "Güvensiz ya da yasa dışı", en: "Unsafe or illegal" },
  reasonOther: { tr: "Başka bir şey", en: "Something else" },
  reportNote: { tr: "Eklemek istediğin", en: "Anything to add" },
  reportSend: { tr: "Şikâyeti gönder", en: "Send the report" },
  reportThanks: { tr: "Teşekkürler. Kafenin ekibi bakacak.", en: "Thank you. The café's team will look at it." },
  pausedNotice: {
    tr: "Kafe seni toplulukta bir süreliğine durdurdu. Okuyabilirsin ama yazamaz, katılamazsın. Penny'n olduğu gibi duruyor.",
    en: "The café has paused you in its community for a while. You can read, but not write or join. Your pennies are untouched.",
  },

  // Typing the code
  codeTitle: { tr: "Ekrandaki kodu yaz", en: "Type the code on the screen" },
  codeBody: {
    tr: "Ödemeden sonra kasadaki küçük ekran 4 haneli bir kod gösterir. Onu buraya yaz.",
    en: "After you pay, the small screen at the till shows a 4-digit code. Type it here.",
  },
  whichCafe: { tr: "Hangi kafe?", en: "Which café?" },
  code: { tr: "Kod", en: "Code" },
  scanInstead: { tr: "Kamerayla QR'ı okutmak daha hızlı.", en: "Scanning the QR with your camera is quicker." },
  another: { tr: "Başka bir kod yaz", en: "Type another code" },

  // Signing in
  signInFirst: { tr: "Penny'yi almak için giriş yap.", en: "Sign in to take your pennies." },
  email: { tr: "E-posta", en: "Email" },
  sendCode: { tr: "Kod gönder", en: "Send code" },
  sending: { tr: "Gönderiliyor…", en: "Sending…" },
  codeSent: { tr: "6 haneli kodu şu adrese gönderdik:", en: "We sent a 6-digit code to" },
  emailCode: { tr: "E-postadaki kod", en: "Code from the email" },
  signInAndTake: { tr: "Giriş yap ve al", en: "Sign in and take it" },
  signIn: { tr: "Giriş yap", en: "Sign in" },
  otherEmail: { tr: "Başka bir e-posta", en: "Another email" },
  emailOff: { tr: "E-postayla giriş şu an kapalı.", en: "Email sign-in is off right now." },
  signedInAs: { tr: "Giriş yapıldı", en: "Signed in" },

  // The app (plan piece 16)
  welcomeHeadline: { tr: "Sokağının kahvesi, şimdi cebinde.", en: "Your street's café, now in your pocket." },
  welcomeBody: {
    tr: "Kahveni aldığın kafede penny biriktir, harca, bir arkadaşına ısmarla, askıya bırak. Kafenin masasına otur, etkinliklerine katıl.",
    en: "Collect pennies at the café you buy your coffee from, spend them, treat a friend, leave some on the askı. Pull up a chair at the café's table and join its events.",
  },
  welcomeCoinAlt: { tr: "Penny: üzerinde keçi olan eski bir gümüş sikke", en: "Penny: an old silver coin with a goat on it" },
  welcomeStart: { tr: "Başla", en: "Get started" },
  haveCafe: { tr: "Kafen mi var?", en: "Run a café?" },
  haveCafeBody: {
    tr: "Penny şimdilik birkaç mahalle kafesiyle başlıyor. Kafenin ekibindeysen panele bilgisayardan girebilirsin; yeni kafeler için başvurular yakında açılıyor.",
    en: "Penny is starting with a few neighbourhood cafés. If you're on a café's team, the panel is on the web; applications for new cafés open soon.",
  },
  signInTitle: { tr: "Giriş yap", en: "Sign in" },
  signInBody: { tr: "Penny'n, ısmarlamaların ve kafelerin hesabında durur.", en: "Your pennies, treats and cafés stay with your account." },
  continueGoogle: { tr: "Google ile devam et", en: "Continue with Google" },
  continueApple: { tr: "Apple ile devam et", en: "Continue with Apple" },
  orEmail: { tr: "ya da e-postayla", en: "or with email" },
  whatsYourName: { tr: "Adın ne?", en: "What's your name?" },
  nameHelp: {
    tr: "Kafede ve ısmarlamalarda adın ve soyadının baş harfi görünür: Ayşe Y.",
    en: "Cafés and treats show your first name and an initial: Ayşe Y.",
  },
  continue: { tr: "Devam", en: "Continue" },
  tabCafes: { tr: "Kafelerim", en: "My cafés" },
  tabEarn: { tr: "Penny al", en: "Get pennies" },
  tabTreats: { tr: "Ismarla", en: "Treats" },
  tabMe: { tr: "Ben", en: "Me" },
  totalPeni: { tr: "Toplam {n} penny", en: "{n} pennies in all" },
  otherCafes: { tr: "Diğer kafeler", en: "Other cafés" },
  nextUp: { tr: "Sıradaki: {title}", en: "Next: {title}" },
  noCafesYet: {
    tr: "Henüz bir kafeye üye değilsin. Bir kafede alışveriş yapınca kasadaki QR'ı okut, penny biriktirmeye başla.",
    en: "You're not a member of any café yet. After a purchase, scan the QR at the till and start collecting pennies.",
  },
  earnTitle: { tr: "Penny'ni al", en: "Get your pennies" },
  earnBody: {
    tr: "Ödemeden sonra kasanın yanındaki küçük ekran bir QR ve 4 haneli bir kod gösterir.",
    en: "After you pay, the small screen by the till shows a QR and a 4-digit code.",
  },
  scanQr: { tr: "QR'ı okut", en: "Scan the QR" },
  scanning: { tr: "QR'ı çerçeveye getir", en: "Hold the QR in the frame" },
  cameraNeeded: { tr: "QR'ı okutmak için kameraya izin ver.", en: "Allow the camera to scan the QR." },
  allowCamera: { tr: "Kameraya izin ver", en: "Allow the camera" },
  cameraDenied: { tr: "Kamera kapalı. Kodu elle yazabilirsin.", en: "The camera is off. You can type the code instead." },
  notPeniQr: { tr: "Bu bir Penny QR'ı değil.", en: "That isn't a Penny QR." },
  orTypeCode: { tr: "ya da kodu yaz", en: "or type the code" },
  profileName: { tr: "Adın", en: "Your name" },
  profileVisible: { tr: "Profilim görünsün", en: "Show my profile" },
  profileVisibleHelp: {
    tr: "Açıkken kafenin üyeleri seni listede bulup ısmarlayabilir; katıldığın etkinliklerde baş harflerin görünür.",
    en: "When on, the café's members can find you to treat you, and your initials show on the events you join.",
  },
  save: { tr: "Kaydet", en: "Save" },
  saved: { tr: "Kaydedildi", en: "Saved" },
  language: { tr: "Dil", en: "Language" },
  signOut: { tr: "Çıkış yap", en: "Sign out" },
  cafePanel: { tr: "Kafe paneli", en: "Café panel" },
  cafePanelHelp: { tr: "{cafes} ekibindesin. Paneli bilgisayardan aç.", en: "You're on the team at {cafes}. Open the panel on the web." },
  back: { tr: "Geri", en: "Back" },
  eventDay: { tr: "Gün", en: "Day" },
  eventHour: { tr: "Saat", en: "Time" },
  eventHourHelp: { tr: "Örneğin 19:30", en: "For example 19:30" },
  today: { tr: "Bugün", en: "Today" },
  tomorrow: { tr: "Yarın", en: "Tomorrow" },
  addToCalendar: { tr: "Takvime ekle", en: "Add to calendar" },

  // Hesabım, Gizlilik, Koşullar (piece 34)
  account: { tr: "Hesabım", en: "Account" },
  signInToAccount: { tr: "Hesabını görmek için giriş yap.", en: "Sign in to see your account." },
  yourData: { tr: "Verilerin", en: "Your data" },
  downloadData: { tr: "Verilerimi indir", en: "Download my data" },
  downloadDataHelp: {
    tr: "Hakkında tuttuğumuz her şey tek bir dosyada: profilin, kafelerin, penny hareketlerin, ısmarlamaların ve yazdıkların.",
    en: "Everything we keep about you in one file: your profile, cafés, penny history, treats and what you wrote.",
  },
  deleteAccount: { tr: "Hesabımı sil", en: "Delete my account" },
  deleteAccountHelp: {
    tr: "Adın, e-postan ve giriş bilgilerin silinir, her yerden çıkış yapılır. Kafelerin defterleri için penny hareketlerin “Silinmiş üye” adıyla kalır.",
    en: "Your name, email and sign-ins are deleted and you're signed out everywhere. Your penny history stays in the cafés' books as “Deleted member”.",
  },
  deleteAccountSure: { tr: "Hesabın silinsin mi?", en: "Delete your account?" },
  deleteAccountPeni: {
    tr: "Kafelerde kalan {peni} penny de silinir. Bu geri alınamaz.",
    en: "The {peni} pennies you have at cafés go too. This can't be undone.",
  },
  deleteAccountNoPeni: { tr: "Bu geri alınamaz.", en: "This can't be undone." },
  deleteAccountYes: { tr: "Evet, hesabımı sil", en: "Yes, delete my account" },
  deleting: { tr: "Siliniyor…", en: "Deleting…" },
  accountDeleted: { tr: "Hesabın silindi. Yolun yine bir kafeye düşerse görüşürüz.", en: "Your account is deleted. See you if you're ever back at a café." },
  keepAccount: { tr: "Vazgeç", en: "Keep it" },
  privacy: { tr: "Gizlilik", en: "Privacy" },
  terms: { tr: "Kullanım koşulları", en: "Terms of use" },
  cafesOnPeni: { tr: "Penny'deki kafeler", en: "Cafés on Penny" },
  getTheApp: { tr: "Uygulamayı indir", en: "Get the app" },
  cafePanelLink: { tr: "Kafe paneline gir", en: "Open the café panel" },
} as const;

export type TextKey = keyof typeof TEXT;

export function text(lang: Lang) {
  return (key: TextKey) => TEXT[key][lang];
}

export type T = ReturnType<typeof text>;

/**
 * English counts its pennies: "1 pennies" reads "1 penny" (and "11 pennies" stays). Turkish
 * never says "pennies", so any text can go through it.
 */
export function onePenny(text: string): string {
  return text.replace(/(^|[^\d.,])1 pennies\b/g, "$11 penny");
}

/** "{name} {n} penny ısmarla" with its blanks filled. */
export function fill(template: string, values: Record<string, string | number>): string {
  return onePenny(template.replace(/\{(\w+)\}/g, (all, key: string) => (key in values ? String(values[key]) : all)));
}

/** What to show for a failed call: the Turkish copy, or the server's English message. */
export function errorText(error: unknown, lang: Lang): string {
  if (error instanceof PeniApiError) return lang === "tr" ? error.message : error.serverMessage;
  return lang === "tr" ? "Bir şeyler ters gitti. Tekrar dene." : "Something went wrong. Try again.";
}
