"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/UserMenu";
import { Bot, Building2, Search, BarChart3 } from "lucide-react";

export function Header() {
  return (
    <header className="sticky top-0 z-20 bg-white border-b border-gray-200">
      <div className="mx-auto w-full max-w-6xl px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bot className="h-7 w-7 text-blue-500" />
            <Link href="/" className="text-xl font-semibold text-gray-900">
              Tender Agent
            </Link>
          </div>
          <nav className="flex items-center gap-1">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="text-gray-600 hover:text-gray-900"
            >
              <Link href="/profilo-aziendale">
                <Building2 className="h-4 w-4" />
                Profilo
              </Link>
            </Button>
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="text-gray-600 hover:text-gray-900"
            >
              <Link href="/ricerca-avanzata">
                <Search className="h-4 w-4" />
                Ricerca
              </Link>
            </Button>
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="text-gray-600 hover:text-gray-900"
            >
              <Link href="/dashboard">
                <BarChart3 className="h-4 w-4" />
                Dashboard
              </Link>
            </Button>
            <UserMenu />
          </nav>
        </div>
      </div>
    </header>
  );
}
