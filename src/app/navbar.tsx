import Link from "next/link";

export default function Navbar() {
  return (
    <header className="bg-background border-b shadow-sm">
      <div className="container px-4 md:px-6 flex items-center h-14 md:h-16">
        <Link
          href="/"
          className="font-bold text-lg md:text-xl"
          prefetch={false}
        >
          Brutna Löften
        </Link>
        {/* <nav className="flex items-center gap-4 md:gap-6 ml-6">
          <Link
            href="#"
            className="text-muted-foreground hover:text-foreground transition-colors"
            prefetch={false}
          >
            Sök
          </Link>
        </nav> */}
      </div>
    </header>
  );
}
