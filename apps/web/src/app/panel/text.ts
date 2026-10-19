import { PeniApiError } from "@peni/api";

/** The café panel's words in Turkish and English. Turkish is the default. */
export type Lang = "tr" | "en";

const TEXT = {
  loading: { tr: "Açılıyor…", en: "Opening…" },
  panel: { tr: "Kafe paneli", en: "Café panel" },
  community: { tr: "Topluluk", en: "Community" },
  communityHelp: {
    tr: "Kafenden haberler, fotoğraflar, etkinlikler ve günün sorusu. Müşterilerin kafenin sayfasında görür, beğenir, yorum yazar ve kendi etkinliklerini açar.",
    en: "News, photos, events and the question of the day from your café. Customers see them on the café's page, like and comment, and open events of their own.",
  },
  signInTitle: { tr: "Kafe paneline giriş", en: "Sign in to the café panel" },
  email: { tr: "E-posta", en: "Email" },
  password: { tr: "Şifre", en: "Password" },
  signIn: { tr: "Giriş yap", en: "Sign in" },
  signOut: { tr: "Çıkış", en: "Sign out" },
  whichCafe: { tr: "Hangi kafe?", en: "Which café?" },
  noAccess: {
    tr: "Bu hesabın paylaşım yapabildiği bir kafe yok. Kafenin sahibi rolünü değiştirebilir.",
    en: "This account can't post for any café. The café's owner can change its role.",
  },
  seePage: { tr: "Kafenin sayfası", en: "The café's page" },

  // Writing a post
  composePlaceholder: { tr: "Ne paylaşmak istersin?", en: "What would you like to share?" },
  questionPlaceholder: { tr: "Bugün ne soralım?", en: "What shall we ask today?" },
  kindPost: { tr: "Paylaşım", en: "Post" },
  kindQuestion: { tr: "Günün sorusu", en: "Question of the day" },
  kindEvent: { tr: "Etkinlik", en: "Event" },
  eventTitle: { tr: "Konu", en: "Topic" },
  eventTitlePlaceholder: { tr: "Ör. Latte art atölyesi", en: "e.g. Latte art workshop" },
  eventWhen: { tr: "Ne zaman?", en: "When?" },
  eventCapacity: { tr: "En çok kaç kişi?", en: "How many people at most?" },
  eventCapacityHelp: { tr: "Boş bırakırsan sınır yok.", en: "Leave it empty for no limit." },
  eventPlaceholder: { tr: "Birkaç kelime: ne yapılacak, kimler gelebilir?", en: "A few words: what happens, who's it for?" },
  addPhotos: { tr: "Fotoğraf ekle", en: "Add photos" },
  photosLeft: { tr: "En çok {n} fotoğraf", en: "Up to {n} photos" },
  uploading: { tr: "Fotoğraf yükleniyor…", en: "Uploading photo…" },
  removePhoto: { tr: "Fotoğrafı çıkar", en: "Remove photo" },
  pinIt: { tr: "En üste sabitle", en: "Pin to the top" },
  publish: { tr: "Paylaş", en: "Post" },
  publishing: { tr: "Paylaşılıyor…", en: "Posting…" },
  photoFailed: { tr: "Bu fotoğraf açılamadı. Başka bir tane seç.", en: "This photo couldn't be opened. Pick another." },

  // The posts
  noPosts: { tr: "Henüz paylaşım yok. İlkini yaz.", en: "No posts yet. Write the first one." },
  pinned: { tr: "Sabit", en: "Pinned" },
  event: { tr: "Etkinlik", en: "Event" },
  question: { tr: "Günün sorusu", en: "Question of the day" },
  likes: { tr: "{n} beğeni", en: "{n} likes" },
  comments: { tr: "{n} yorum", en: "{n} comments" },
  going: { tr: "{n} katılan", en: "{n} going" },
  goingOf: { tr: "{n}/{max} katılan", en: "{n} of {max} going" },
  memberEvent: { tr: "Üye etkinliği", en: "Member's event" },
  hostedBy: { tr: "Açan: {name}", en: "Opened by {name}" },
  memberEventHelp: {
    tr: "Bunu bir üye açtı. Sabitleyebilir ya da kaldırabilirsin; yazıyı yalnız açan değiştirir.",
    en: "A member opened this. You can pin it or take it down; only they can change the words.",
  },
  reportsN: { tr: "{n} şikâyet", en: "{n} reports" },

  // Reports and paused members (piece 15)
  reports: { tr: "Şikâyetler", en: "Reports" },
  reportsHelp: {
    tr: "Üyelerin şikâyet ettiği yorumlar ve etkinlikler. Üç üye şikâyet edince, sen bakana kadar gizlenir.",
    en: "Comments and events members reported. Once three members report something, it's hidden until you look.",
  },
  reportOnComment: { tr: "Yorum · {title}", en: "Comment · {title}" },
  reportOnEvent: { tr: "Üye etkinliği", en: "Member's event" },
  autoHidden: { tr: "Şimdilik gizli", en: "Hidden for now" },
  reasonSpam: { tr: "Reklam ya da spam", en: "Ads or spam" },
  reasonRude: { tr: "Kaba ya da kırıcı", en: "Rude or hurtful" },
  reasonUnsafe: { tr: "Güvensiz ya da yasa dışı", en: "Unsafe or illegal" },
  reasonOther: { tr: "Başka bir şey", en: "Something else" },
  firstReported: { tr: "İlk şikâyet {when}", en: "First reported {when}" },
  writtenBy: { tr: "Yazan: {name}", en: "Written by {name}" },
  pausedTag: { tr: "durduruldu", en: "paused" },
  takeDown: { tr: "Kaldır", en: "Take down" },
  takeDownAndPause: { tr: "Kaldır, üyeyi durdur", en: "Take down, pause member" },
  keepIt: { tr: "Sorun yok", en: "It's fine" },
  pauseHelp: {
    tr: "Durdurulan üye kafenin sayfasını okur ama yazamaz, beğenemez, katılamaz. Peni'si ve askı hakkı olduğu gibi kalır.",
    en: "A paused member can read the café's page but can't write, like or join. Their peni and the askı stay as they are.",
  },
  pausedMembers: { tr: "Durdurulan üyeler", en: "Paused members" },
  pausedSince: { tr: "{when} tarihinden beri", en: "since {when}" },
  unpause: { tr: "Geri al", en: "Let back in" },
  pin: { tr: "Sabitle", en: "Pin" },
  unpin: { tr: "Sabitlemeyi kaldır", en: "Unpin" },
  edit: { tr: "Düzenle", en: "Edit" },
  save: { tr: "Kaydet", en: "Save" },
  cancel: { tr: "Vazgeç", en: "Cancel" },
  remove: { tr: "Kaldır", en: "Take down" },
  removeTitle: { tr: "Paylaşım kaldırılsın mı?", en: "Take this post down?" },
  removeBody: {
    tr: "Akıştan ve kafenin sayfasından kalkar, yorumları da görünmez olur. Kayıtta kalır ama geri getirilemez.",
    en: "It leaves the feed and the café's page, with its comments. It stays on record but can't be brought back.",
  },
  removeYes: { tr: "Evet, kaldır", en: "Yes, take it down" },
  close: { tr: "Kapat", en: "Close" },
  hide: { tr: "Gizle", en: "Hide" },
  unhide: { tr: "Geri getir", en: "Bring back" },
  hidden: { tr: "Gizli", en: "Hidden" },
  hiddenHelp: { tr: "Gizli yorumları yalnız ekip görür.", en: "Only the team sees hidden comments." },
  by: { tr: "{name} paylaştı", en: "Posted by {name}" },
  photo: { tr: "Fotoğraf", en: "Photo" },
} as const;

export type TextKey = keyof typeof TEXT;

export function text(lang: Lang) {
  return (key: TextKey) => TEXT[key][lang];
}

export type T = ReturnType<typeof text>;

export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? ""));
}

export function errorText(error: unknown, lang: Lang): string {
  if (error instanceof PeniApiError) return lang === "tr" ? error.message : error.serverMessage;
  return lang === "tr" ? "Bir şeyler ters gitti. Tekrar dene." : "Something went wrong. Try again.";
}
