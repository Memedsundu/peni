# Vision

## Misyon

> 17. yüzyılda kahvehane, sınıf farkı gözetmeksizin herkesin bir masaya oturup fikir alışverişi yapabildiği "peni üniversitesi"ydi. Peni, bu geleneği telefonuna taşır: her kafe, mahallesinin küçük kamusal alanı; her müşteri, o alanın eşit bir katılımcısı.

Kahvehane, tarih boyunca insanların statüsü, mesleği ya da servetinden bağımsız olarak bir araya gelip ortak meseleleri konuştuğu ender mekânlardan biri olmuştur. 17. yüzyıl İngiltere'sinde bir peni karşılığında girilebildiği için "peni üniversitesi" diye anılan kahvehaneler, soylusuyla tüccarının aynı masada oturup tartışabildiği, otoritenin değil merakın belirlediği bir alan kurmuştu. Habermas'ın deyişiyle bu, devletin ve geleneksel otoritenin dışında, akılcı ve eşit tartışmanın filizlendiği bir "kamusal alan"dı.

Peni bu fikri bugüne taşımayı hedefler. Amacımız her kafeyi kendi mahallesinin küçük kamusal alanına dönüştürmek: giriş engeli düşük, katılımı herkese açık, sınıf ya da tanıdıklık gözetmeyen bir yer. Müşteri burada sadece sipariş vermez. Kafenin akışını takip eder, yorum yazar, komşusunu tanır. Kahveni beklerken bir topluluğun eşit bir parçası olduğunu hissetmen, bu ürünün var olma sebebidir.

## How the mission shows up in the product

| The penny university had… | Peni has… |
|---|---|
| A penny at the door: a low price of entry | **Askıda kahve.** Anyone can take a tea or coffee that someone else left, once a day, without their name being shown. The barrier to sitting down is close to zero. |
| Strangers at one table | **Peni masası.** A café event with a topic, a time and a big table. The app gets people into the room, and the talking happens face to face. |
| Arguments about the news of the day | **Günün sorusu.** The café asks one question and members answer under it. A conversation, but one the café steers. |
| Lectures for a penny | **Peni sohbeti.** A member gives a 20-minute talk: the history of the neighbourhood, fixing a bike, doing your taxes. Same event type. |
| Regulars who knew each other | **Ismarlama.** Treat a friend at the café you both go to. |

## Decisions carried over from the Shelby customer-app design (17 Sept 2026)

| Topic | Decision |
|---|---|
| Ordering vs. community | Equal weight. Both are measured from day one so we can tell, after 3 months, which one people actually use |
| Order flow | The barista **accepts** before preparing |
| Payment | At the till. **No money moves in the app** |
| Cost of peni | No expense line. The report shows what was given away and its ingredient cost |
| Platform | Real phone app (App Store + Google Play), **plus web** |
| Cafés & peni | A customer joins many cafés; **peni is kept per café** and never moves between cafés |
| Login | Phone number + SMS code |
| Social limits | Feed, comments, likes, visible profiles. **No direct messages.** Only staff post |
| Earn rule | A share of what was paid. **Each café sets its rate** |
| Business model | The café pays a monthly fee; free for customers |
| Barista screen | A separate "Gelen Siparişler" board, outside the till screen |
| Team | One person, part time |

### New in Peni

| Topic | Decision |
|---|---|
| Name | **Peni**, for the whole product (customer and café sides) |
| Codebase | A **separate repository**. Shelby remains the café's back office (till, stock, payroll, accounting); Peni connects to it |
| Points | Called **peni**. 1 peni = 1 TL at the issuing café |
| Askıda kahve | An **open askı per café**, funded by member peni, cash at the till, and optional café matching. Gifts (*ısmarlama*) stay person-to-person |
| Without Shelby | Peni also works standalone, so cafés not on Shelby can use it |

## Why the community side is shaped like this

Every limit on the community side serves the mission: a public space is only public while people feel safe in it.

- **Only staff post**, so ten café accounts create the content instead of five hundred customers. Moderation stays small enough for one person to handle.
- **No direct messages.** Nothing happens out of sight.
- **Profiles are hidden by default**: you choose to be seen. That's also the right default under KVKK.
- **Three reports hide a comment** until staff look at it.
- **People who take from the askı are never named**, not even to other members. Donors are named only if they choose to be.

The aim is a public space, not a closed one; these rules are what let it stay open.
