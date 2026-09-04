import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <p className="text-gold text-xs tracking-[0.2em] font-body font-medium mb-4">ILG ACADEMY</p>
      <h1 className="font-display text-4xl md:text-6xl text-ivory italic mb-6 max-w-2xl">
        The live quiz engine for the sales floor
      </h1>
      <p className="text-parchment/60 max-w-md mb-10">
        Build reusable quiz templates, launch a live session with a QR code, and watch scores climb in real time.
      </p>
      <Link href="/admin" className="btn-gold">
        Open Admin
      </Link>
    </main>
  );
}
