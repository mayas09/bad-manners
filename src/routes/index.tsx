import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Component, useEffect, useState, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Coffee,
  Flame,
  MapPin,
  Clock,
  Instagram,
  Facebook,
  Heart,
  PawPrint,
  Sparkles,
  Gift,
  Menu as MenuIcon,
  X,
  Plus,
} from "lucide-react";
import logo from "@/assets/logo.jpg";
import { PHOTOS as FALLBACK_PHOTOS } from "@/components/site/photos";
import { useReveal } from "@/components/site/use-reveal";
import { CateringForm } from "@/components/site/CateringForm";
import { useSiteContent } from "@/components/site/use-site-content";
import { useCart } from "@/lib/cart-context";
import { CartButton, CartDrawer } from "@/components/site/CartDrawer";
import { AccountNav } from "@/components/site/AccountNav";
import { NotificationBell } from "@/components/site/NotificationBell";
import { parsePriceToCents, formatCents } from "@/lib/price-utils";
import { useFavorites } from "@/lib/use-favorites";
import { toast } from "sonner";

/**
 * Post-auth nav widgets (account menu, notifications) read the customer
 * profile and open a Realtime subscription. If either throws, this keeps
 * the crash contained so the public homepage still renders normally
 * instead of the whole route falling back to a blank crash screen.
 */
class AccountWidgetsBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: unknown) {
    console.error("Account widgets failed to render", error);
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bad Manners Coffee — West Asheville's goth-Barbie coffee shop" },
      {
        name: "description",
        content:
          "Independent coffee shop on Haywood Rd, West Asheville. Specialty espresso, seasonal drinks, dog-friendly, mutual-aid rooted.",
      },
      { property: "og:title", content: "Bad Manners Coffee" },
      {
        property: "og:description",
        content:
          "Goth-Barbie-punk coffee on Haywood Rd. Specialty espresso, seasonal drinks, pop-ups.",
      },
      { property: "og:image", content: FALLBACK_PHOTOS.heroInterior },
      { name: "twitter:image", content: FALLBACK_PHOTOS.heroInterior },
    ],
  }),
  component: Home,
  // Post-auth widgets are already contained by AccountWidgetsBoundary above,
  // but if something unexpected still throws, fall back to the public
  // homepage instead of the generic root "This page didn't load" screen.
  errorComponent: () => <Home />,
});

function Home() {
  useReveal();
  const content = useSiteContent();
  const { photos: PHOTOS, menu: MENU, info: INFO, hours: HOURS } = content;
  return (
    <div className="relative min-h-screen overflow-x-clip bg-background text-foreground">
      <BgFlourishes />
      <Nav />
      <Hero photos={PHOTOS} />
      <Story photos={PHOTOS} />
      <MenuSection menu={MENU} />
      <Gallery photos={PHOTOS} />
      <Community photos={PHOTOS} />
      <Visit info={INFO} hours={HOURS} />
      <GiftAndCatering info={INFO} />
      <Footer info={INFO} />
      <CartButton />
      <CartDrawer />
      <Toaster richColors position="top-center" />
    </div>
  );
}

/* ----------------------------- decorative bg ----------------------------- */

function BgFlourishes() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      <div
        className="absolute -top-32 -left-32 h-[520px] w-[520px] rounded-full opacity-30 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--pink) 0%, transparent 65%)" }}
      />
      <div
        className="absolute top-1/3 -right-40 h-[600px] w-[600px] rounded-full opacity-25 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--fire-mid) 0%, transparent 65%)" }}
      />
      <div
        className="absolute bottom-0 left-1/3 h-[400px] w-[400px] rounded-full opacity-20 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--fire-to) 0%, transparent 65%)" }}
      />
    </div>
  );
}

/* --------------------------------- nav --------------------------------- */

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 30);
    fn();
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);
  const links = [
    { href: "#story", label: "Story" },
    { href: "#menu", label: "Menu" },
    { href: "#community", label: "Community" },
    { href: "#visit", label: "Visit" },
    { href: "#catering", label: "Catering" },
  ];
  return (
    <header className={`fixed inset-x-0 top-0 z-40 transition-all ${scrolled ? "py-2" : "py-4"}`}>
      <div className="mx-auto max-w-7xl px-4">
        <div
          className={`flex items-center justify-between rounded-2xl px-4 py-2 transition-all ${scrolled ? "glass" : ""}`}
        >
          <a href="#top" className="flex items-center gap-3">
            <img
              src={logo}
              alt="Bad Manners Coffee"
              className="h-10 w-10 rounded-full object-cover ring-2 ring-[--pink]/40"
            />
            <span className="font-display text-xl leading-none">
              Bad <span className="text-fire">Manners</span>
            </span>
          </a>
          <nav className="hidden items-center gap-6 md:flex">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="text-sm font-medium text-foreground/80 hover:text-[--pink-deep] transition-colors"
              >
                {l.label}
              </a>
            ))}
            <AccountWidgetsBoundary>
              <AccountNav />
              <NotificationBell />
            </AccountWidgetsBoundary>
            <Button asChild className="bg-fire text-white hover:opacity-95">
              <a href="#visit">
                <MapPin className="mr-1.5 size-4" />
                Find Us
              </a>
            </Button>
          </nav>
          <div className="md:hidden flex items-center gap-1">
            <AccountWidgetsBoundary>
              <AccountNav />
              <NotificationBell />
            </AccountWidgetsBoundary>
            <button className="p-2" onClick={() => setOpen((s) => !s)} aria-label="Toggle menu">
              {open ? <X className="size-6" /> : <MenuIcon className="size-6" />}
            </button>
          </div>
        </div>
        {open && (
          <div className="md:hidden mt-2 glass rounded-2xl p-4 grid gap-3">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="text-base font-medium"
              >
                {l.label}
              </a>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}

/* --------------------------------- hero --------------------------------- */

type SiteImages = typeof FALLBACK_PHOTOS;
type SiteInfo = {
  address_line1: string;
  address_line2: string;
  instagram_url: string;
  facebook_url: string;
  gift_card_url: string;
  map_query: string;
};
type SiteHours = { label: string; hours_text: string }[];

function Hero({ photos: PHOTOS }: { photos: SiteImages }) {
  return (
    <section id="top" className="relative grain isolate overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <img src={PHOTOS.heroInterior} alt="" className="h-full w-full object-cover opacity-25" />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(255,235,240,.6), rgba(255,200,180,.25) 60%, var(--background))",
          }}
        />
      </div>
      <div className="mx-auto max-w-7xl px-4 pt-36 pb-24 sm:pt-44 sm:pb-32 grid gap-10 lg:grid-cols-2 lg:items-center">
        <div className="reveal">
          <span className="inline-flex items-center gap-2 rounded-full glass px-3 py-1 text-xs uppercase tracking-[0.2em] text-[--pink-deep]">
            <Sparkles className="size-3.5" /> West Asheville, NC
          </span>
          <h1 className="mt-5 font-display text-5xl leading-[1.05] sm:text-7xl">
            Bad <span className="text-fire">Manners</span>
            <br />
            <span className="font-serif italic text-foreground/85">good coffee.</span>
          </h1>
          <p className="mt-5 max-w-lg text-lg text-muted-foreground">
            Goth-Barbie-punk coffee on Haywood Rd. Hand-pulled espresso, weird-good seasonal drinks,
            dog-friendly patio, and a hot-pink room full of regulars.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button
              asChild
              size="lg"
              className="bg-fire text-white hover:opacity-95 h-12 px-6 text-base"
            >
              <a href="#menu">
                <Coffee className="mr-2 size-5" />
                View Menu
              </a>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 px-6 text-base border-[--pink]/40 hover:bg-[--pink]/10"
            >
              <a href="#visit">
                <MapPin className="mr-2 size-5" />
                Find Us
              </a>
            </Button>
          </div>
          <div className="mt-10 flex items-center gap-6 text-xs uppercase tracking-[0.2em] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <PawPrint className="size-4 text-[--pink-deep]" />
              Dog-friendly
            </span>
            <span className="flex items-center gap-1.5">
              <Heart className="size-4 text-[--pink-deep]" />
              Mutual-aid rooted
            </span>
            <span className="hidden sm:flex items-center gap-1.5">
              <Flame className="size-4 text-[--pink-deep]" />
              Pop-up events
            </span>
          </div>
        </div>

        <div className="reveal relative mx-auto lg:mx-0">
          <div className="relative aspect-square w-72 sm:w-96 lg:w-[28rem]">
            <div className="absolute inset-0 rounded-full bg-fire blur-2xl opacity-40 spin-slow" />
            <div className="absolute inset-3 rounded-full bg-white/80 backdrop-blur-xl ring-1 ring-[--pink]/30 shadow-2xl" />
            <img
              src={logo}
              alt="Bad Manners Coffee logo"
              className="absolute inset-6 rounded-full object-cover shadow-xl"
            />
            {/* steam */}
            <div className="absolute -top-6 left-1/2 -translate-x-1/2">
              <span className="steam" style={{ animationDelay: "0s" }} />
              <span
                className="steam"
                style={{ animationDelay: "1.4s", left: "calc(50% - 18px)" }}
              />
              <span
                className="steam"
                style={{ animationDelay: "2.6s", left: "calc(50% + 14px)" }}
              />
            </div>
            {/* orbiting stars */}
            <Star className="absolute -top-2 -right-2 text-[--pink-deep]" />
            <Star className="absolute bottom-4 -left-4 text-[--fire-mid] size-7" />
            <Star className="absolute top-1/2 -right-6 text-[--fire-to] size-5" />
          </div>
        </div>
      </div>
    </section>
  );
}

function Star({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`size-6 flicker ${className}`} fill="currentColor">
      <path d="M12 1.5l2.4 6.6L21 10.5l-5.4 4.5L17.4 22 12 17.7 6.6 22l1.8-7L3 10.5l6.6-2.4z" />
    </svg>
  );
}

/* --------------------------------- story --------------------------------- */

function Story({ photos: PHOTOS }: { photos: SiteImages }) {
  return (
    <section id="story" className="relative mx-auto max-w-7xl px-4 py-24 sm:py-32">
      <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
        <div className="reveal order-2 lg:order-1">
          <span className="text-xs uppercase tracking-[0.3em] text-[--pink-deep]">Our story</span>
          <h2 className="mt-3 font-display text-4xl sm:text-5xl">
            Started in a corner. <span className="text-fire">Stayed weird.</span>
          </h2>
          <div className="mt-6 space-y-4 text-lg text-muted-foreground font-serif">
            <p>
              Bad Manners began in December 2023 as a tiny coffee cart tucked inside Provisions
              Mercantile — Ash slinging espresso between vintage racks and the kind of regulars who
              become friends by the second visit.
            </p>
            <p>
              A year later we crossed the river and unlocked the door at 697 Haywood Rd. Same
              drinks, same rules: be a little rude to mediocrity, be very kind to people. The walls
              are pink. The espresso is dialed. The dog gets a pup cup.
            </p>
          </div>
          <div className="mt-8 flex items-center gap-4">
            <div className="h-px flex-1 bg-gradient-to-r from-[--pink]/40 to-transparent" />
            <span className="font-display text-2xl text-fire">— Ash, owner</span>
          </div>
        </div>
        <div className="reveal order-1 lg:order-2">
          <div className="relative tilt-card">
            <div className="absolute -inset-3 rounded-3xl bg-fire opacity-25 blur-2xl" />
            <img
              src={PHOTOS.story}
              alt="Inside Bad Manners Coffee"
              className="relative w-full rounded-3xl object-cover aspect-[4/5] shadow-2xl ring-1 ring-[--pink]/30"
            />
            <div className="absolute -bottom-6 -left-6 glass rounded-2xl px-5 py-3">
              <p className="font-display text-2xl text-fire">Est. 2023</p>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                West Asheville
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------- menu --------------------------------- */

function AddToCartBtn({ item, cents }: { item: { id?: string; name: string }; cents: number }) {
  const cart = useCart();
  return (
    <button
      onClick={() => {
        cart.add({
          id: item.id ? `menu:${item.id}` : `name:${item.name}`,
          name: item.name,
          unit_price_cents: cents,
        });
        toast.success(`${item.name} added — ${formatCents(cents)}`, { duration: 1600 });
      }}
      className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-full border border-[--pink]/40 bg-white/80 text-[color:var(--pink-deep)] hover:bg-[color:var(--pink-deep)] hover:text-white hover:border-[color:var(--pink-deep)] px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors"
    >
      <Plus className="size-3.5" /> Add to cart
    </button>
  );
}

function MenuItemImage({ src, alt }: { src?: string | null; alt: string }) {
  return (
    <div className="relative -mx-5 -mt-5 mb-1 aspect-[16/9] overflow-hidden rounded-t-2xl bg-[color:var(--pink-deep)]">
      {src ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          <img
            src={logo}
            alt=""
            aria-hidden="true"
            className="h-16 w-16 rounded-full object-cover opacity-90 ring-2 ring-white/30"
          />
        </div>
      )}
    </div>
  );
}

function FavoriteHeart({ itemId }: { itemId?: string }) {
  const fav = useFavorites();
  const nav = useNavigate();
  if (!itemId) return null;
  const active = fav.ids.has(itemId);
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation();
        const res = await fav.toggle(itemId);
        if (res.needsAuth) {
          toast("Sign in to save favorites", { duration: 1600 });
          nav({ to: "/account/login" });
          return;
        }
        toast.success(res.isFav ? "Added to favorites 🖤" : "Removed from favorites", {
          duration: 1200,
        });
      }}
      aria-label={active ? "Remove favorite" : "Add favorite"}
      aria-pressed={active}
      className="absolute top-2 right-2 z-10 grid size-9 place-items-center rounded-full bg-white/90 backdrop-blur-sm text-[color:var(--pink-deep)] shadow-md hover:bg-white transition-colors"
    >
      <Heart className={`size-4 ${active ? "fill-current" : ""}`} strokeWidth={2.25} />
    </button>
  );
}

function DiscountBadge({ item }: { item: import("@/components/site/menu-data").MenuItem }) {
  if (!item.discount_type || !item.discount_value) return null;
  const label =
    item.discount_type === "percent"
      ? `-${Math.round(item.discount_value)}%`
      : `-$${item.discount_value.toFixed(2)}`;
  return (
    <span className="absolute top-2 left-2 z-10 inline-flex items-center rounded-full bg-[color:var(--pink-deep)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-md">
      {label}
    </span>
  );
}

function MenuSection({
  menu: MENU,
}: {
  menu: import("@/components/site/menu-data").MenuSection[];
}) {
  return (
    <section
      id="menu"
      className="relative py-24 sm:py-32"
      style={{
        background:
          "linear-gradient(180deg, transparent, color-mix(in oklch, var(--pink) 6%, transparent), transparent)",
      }}
    >
      <div className="mx-auto max-w-7xl px-4">
        <div className="reveal text-center">
          <span className="text-xs uppercase tracking-[0.3em] text-[--pink-deep]">The Menu</span>
          <h2 className="mt-3 font-display text-4xl sm:text-5xl">
            Pulled, steamed, <span className="text-fire">slightly haunted.</span>
          </h2>
          <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
            Prices and offerings rotate. Ask about today's beans and the secret seasonal board.
          </p>
        </div>

        <Tabs defaultValue="coffee" className="mt-12 reveal">
          <TabsList className="mx-auto flex h-auto flex-wrap justify-center gap-2 bg-transparent">
            {MENU.map((s) => (
              <TabsTrigger
                key={s.id}
                value={s.id}
                className="rounded-full px-5 py-2 font-display text-base data-[state=active]:bg-fire data-[state=active]:text-white data-[state=active]:shadow-lg"
              >
                {s.title}
              </TabsTrigger>
            ))}
          </TabsList>

          {MENU.map((s) => (
            <TabsContent key={s.id} value={s.id} className="mt-10">
              {s.blurb && (
                <p className="text-center font-serif italic text-muted-foreground mb-8">
                  {s.blurb}
                </p>
              )}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {s.items.map((item, i) => {
                  const cents = parsePriceToCents(item.price);
                  const canOrder = !!cents && !item.is_sold_out;
                  const hasDiscount =
                    !!item.original_price_cents &&
                    !!cents &&
                    item.original_price_cents > cents;
                  return (
                    <div
                      key={item.id ?? i}
                      className={`tilt-card glass rounded-2xl p-5 flex flex-col gap-3 overflow-hidden ${item.is_sold_out ? "opacity-70" : ""}`}
                    >
                      <div className="relative -mx-5 -mt-5 mb-1">
                        <MenuItemImage src={item.image_url} alt={item.name} />
                        {hasDiscount && <DiscountBadge item={item} />}
                        <FavoriteHeart itemId={item.id} />
                      </div>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-display text-xl leading-tight">{item.name}</h3>
                            {item.is_sold_out && (
                              <span className="inline-flex items-center rounded-full border border-[--pink-deep] bg-[--pink-deep]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[--pink-deep]">
                                Sold Out
                              </span>
                            )}
                          </div>
                          {item.note && (
                            <p className="mt-1 text-sm text-muted-foreground font-serif italic">
                              {item.note}
                            </p>
                          )}
                        </div>
                        {item.price && (
                          <div className="text-right whitespace-nowrap">
                            {hasDiscount && (
                              <div className="text-xs text-muted-foreground line-through">
                                {formatCents(item.original_price_cents!)}
                              </div>
                            )}
                            <span
                              className={`font-display text-lg ${item.is_sold_out ? "line-through text-muted-foreground" : "text-fire"}`}
                            >
                              {item.price}
                            </span>
                          </div>
                        )}
                      </div>
                      {canOrder && <AddToCartBtn item={item} cents={cents!} />}
                    </div>
                  );
                })}
              </div>
              {s.footer && (
                <div className="mt-8 flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm">
                  {s.footer.map((f, i) => (
                    <div key={i} className="font-serif">
                      <span className="font-display text-fire mr-2">{f.label}:</span>
                      <span className="text-muted-foreground">{f.values.join(", ")}</span>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </section>
  );
}

/* --------------------------------- gallery --------------------------------- */

function Gallery({ photos: PHOTOS }: { photos: SiteImages }) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-20">
      <div className="reveal grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        {PHOTOS.gallery.map((src, i) => (
          <div
            key={i}
            className={`tilt-card relative overflow-hidden rounded-2xl ${i % 5 === 0 ? "sm:row-span-2 sm:aspect-square" : "aspect-square"}`}
          >
            <img
              src={src}
              alt={`Bad Manners Coffee gallery photo ${i + 1}`}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-700 hover:scale-110"
            />
          </div>
        ))}
      </div>
    </section>
  );
}

/* --------------------------------- community --------------------------------- */

function Community({ photos: PHOTOS }: { photos: SiteImages }) {
  const cards = [
    {
      icon: PawPrint,
      title: "Dog-friendly",
      body: "Patio pups always welcome. Pup cups on the house.",
    },
    {
      icon: Heart,
      title: "Mutual aid",
      body: "We contribute to local mutual-aid funds and host benefit days for neighbors in need.",
    },
    {
      icon: Sparkles,
      title: "Pop-ups & events",
      body: "Tattoo flash days, vinyl nights, queer markets, and seasonal collabs with WNC makers.",
    },
  ];
  return (
    <section id="community" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 grid gap-12 lg:grid-cols-5 lg:items-center">
        <div className="reveal lg:col-span-2">
          <span className="text-xs uppercase tracking-[0.3em] text-[--pink-deep]">Community</span>
          <h2 className="mt-3 font-display text-4xl sm:text-5xl">
            Coffee is the <span className="text-fire">excuse.</span>
          </h2>
          <p className="mt-5 text-muted-foreground text-lg font-serif">
            The shop is a living room for the strange and the kind. Bring your dog, bring your zine,
            bring your hangover. We'll handle the rest.
          </p>
          <img
            src={PHOTOS.community}
            alt="Community at Bad Manners"
            className="mt-8 rounded-2xl aspect-[4/3] w-full object-cover ring-1 ring-[--pink]/30"
          />
        </div>
        <div className="lg:col-span-3 grid gap-4 sm:grid-cols-1">
          {cards.map((c, i) => (
            <div key={i} className="reveal tilt-card glass rounded-2xl p-6 flex gap-5">
              <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-fire text-white">
                <c.icon className="size-7" />
              </div>
              <div>
                <h3 className="font-display text-2xl">{c.title}</h3>
                <p className="mt-1 text-muted-foreground">{c.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------- visit --------------------------------- */

function Visit({ info, hours }: { info: SiteInfo; hours: SiteHours }) {
  const mapQ = encodeURIComponent(info.map_query);
  return (
    <section
      id="visit"
      className="relative py-24 sm:py-32"
      style={{
        background:
          "linear-gradient(180deg, transparent, color-mix(in oklch, var(--fire-to) 8%, transparent), transparent)",
      }}
    >
      <div className="mx-auto max-w-7xl px-4">
        <div className="reveal text-center">
          <span className="text-xs uppercase tracking-[0.3em] text-[--pink-deep]">Visit us</span>
          <h2 className="mt-3 font-display text-4xl sm:text-5xl">
            {info.address_line1.split(",")[0]},{" "}
            <span className="text-fire">
              {info.address_line1.split(",").slice(1).join(",").trim() || "Suite G"}
            </span>
          </h2>
        </div>
        <div className="mt-12 grid gap-8 lg:grid-cols-2">
          <div className="reveal glass rounded-3xl p-8 space-y-6">
            <div className="flex items-start gap-4">
              <MapPin className="size-6 text-[--pink-deep] mt-1" />
              <div>
                <p className="font-display text-xl">Address</p>
                <p className="mt-1 text-muted-foreground">
                  {info.address_line1}
                  <br />
                  {info.address_line2}
                </p>
                <a
                  className="mt-2 inline-block text-sm font-medium text-[--pink-deep] underline decoration-dotted underline-offset-4"
                  href={`https://maps.google.com/?q=${mapQ}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open in Google Maps →
                </a>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <Clock className="size-6 text-[--pink-deep] mt-1" />
              <div className="w-full">
                <p className="font-display text-xl">Hours</p>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-muted-foreground">
                  {hours.flatMap((h, i) => [
                    <dt key={`l${i}`}>{h.label}</dt>,
                    <dd key={`v${i}`}>{h.hours_text}</dd>,
                  ])}
                </dl>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <Instagram className="size-6 text-[--pink-deep] mt-1" />
              <div>
                <p className="font-display text-xl">Say hi</p>
                <p className="mt-1 text-muted-foreground">
                  DMs open on Instagram for daily specials & event news.
                </p>
              </div>
            </div>
          </div>
          <div className="reveal relative overflow-hidden rounded-3xl ring-1 ring-[--pink]/30 min-h-[420px] tilt-card">
            <iframe
              title="Bad Manners Coffee map"
              src={`https://www.google.com/maps?q=${mapQ}&output=embed`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="absolute inset-0 h-full w-full"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------- gift cards + catering ------------------------- */

function GiftAndCatering({ info }: { info: SiteInfo }) {
  return (
    <section
      id="catering"
      className="mx-auto max-w-7xl px-4 py-24 sm:py-32 grid gap-12 lg:grid-cols-2"
    >
      <div className="reveal relative overflow-hidden rounded-3xl bg-fire p-10 text-white tilt-card">
        <div className="absolute -right-12 -top-12 opacity-25 spin-slow">
          <Star className="size-64" />
        </div>
        <Gift className="size-10" />
        <h3 className="mt-4 font-display text-4xl">Gift Cards</h3>
        <p className="mt-3 max-w-md text-white/90 font-serif text-lg">
          Caffeinate someone you love (or owe). Digital and physical cards available through our
          Square store.
        </p>
        <Button
          asChild
          size="lg"
          variant="secondary"
          className="mt-6 bg-white text-[--pink-deep] hover:bg-white/90"
        >
          <a href={info.gift_card_url} target="_blank" rel="noreferrer">
            Buy a gift card →
          </a>
        </Button>
      </div>

      <div className="reveal">
        <span className="text-xs uppercase tracking-[0.3em] text-[--pink-deep]">
          Catering & events
        </span>
        <h3 className="mt-3 font-display text-4xl">Bring us to your thing.</h3>
        <p className="mt-3 text-muted-foreground font-serif text-lg">
          Weddings, markets, office mornings, weird-art openings — tell us what you're planning and
          we'll get back with a quote.
        </p>
        <div className="mt-6">
          <CateringForm />
        </div>
      </div>
    </section>
  );
}

/* --------------------------------- footer --------------------------------- */

function Footer({ info }: { info: SiteInfo }) {
  return (
    <footer className="relative mt-16 border-t border-[--pink]/20">
      <div className="mx-auto max-w-7xl px-4 py-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Link to="/" className="flex items-center gap-3">
            <img
              src={logo}
              alt=""
              className="h-12 w-12 rounded-full object-cover ring-2 ring-[--pink]/40"
            />
            <span className="font-display text-2xl">
              Bad <span className="text-fire">Manners</span>
            </span>
          </Link>
          <p className="mt-4 text-sm text-muted-foreground">
            Independent coffee shop in West Asheville. Pink walls, dialed espresso, community-first.
          </p>
        </div>
        <div>
          <p className="font-display text-lg">Explore</p>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>
              <a href="#story" className="hover:text-[--pink-deep]">
                Our Story
              </a>
            </li>
            <li>
              <a href="#menu" className="hover:text-[--pink-deep]">
                Menu
              </a>
            </li>
            <li>
              <a href="#community" className="hover:text-[--pink-deep]">
                Community
              </a>
            </li>
            <li>
              <a href="#visit" className="hover:text-[--pink-deep]">
                Visit
              </a>
            </li>
            <li>
              <a href="#catering" className="hover:text-[--pink-deep]">
                Catering
              </a>
            </li>
          </ul>
        </div>
        <div>
          <p className="font-display text-lg">Follow</p>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>
              <a
                href={info.instagram_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 hover:text-[--pink-deep]"
              >
                <Instagram className="size-4" /> Instagram
              </a>
            </li>
            <li>
              <a
                href={info.facebook_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 hover:text-[--pink-deep]"
              >
                <Facebook className="size-4" /> Facebook
              </a>
            </li>
          </ul>
        </div>
        <div>
          <p className="font-display text-lg">Press</p>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>
              <a
                href="https://carolinas.eater.com/"
                target="_blank"
                rel="noreferrer"
                className="hover:text-[--pink-deep]"
              >
                "Goth Barbie-punk" — Eater Carolinas
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-[--pink]/15">
        <div className="mx-auto max-w-7xl px-4 py-6 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} Bad Manners Coffee. All rights reserved.</p>
          <p className="font-display">Be kind. Be a little bad.</p>
        </div>
      </div>
    </footer>
  );
}
