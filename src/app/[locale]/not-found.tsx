import Link from "next/link";
import en from "@/i18n/dictionaries/en";

export default function NotFound() {
  return (
    <div className="grid gap-3 py-12">
      <h1 className="m-0 text-5 font-extrabold">{en.notFound.title}</h1>
      <Link href="/en" className="text-3 font-semibold underline underline-offset-4">
        {en.notFound.back}
      </Link>
    </div>
  );
}
