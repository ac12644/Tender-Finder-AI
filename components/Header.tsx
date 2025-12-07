"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/UserMenu";
import {
  Bot,
  Building2,
  Search,
  BarChart3,
  Settings,
  FileText,
  Heart,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";

const ADMIN_UID = process.env.ADMIN_UID;

export function Header() {
  const { uid } = useAuth();
  const isLoggedIn = !!uid;
  const isAdmin = uid === ADMIN_UID;

  return (
    <header className="sticky top-0 z-20 bg-white border-b border-gray-200">
      <div className="mx-auto w-full max-w-6xl px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bot className="h-7 w-7 text-blue-500" />
            <Link href="/" className="text-xl font-semibold text-gray-900">
              Bandifinder.it
            </Link>
          </div>
          <nav className="flex items-center gap-1">
            {isLoggedIn && (
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
            )}
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
            {isLoggedIn && (
              <>
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="text-gray-600 hover:text-gray-900"
                >
                  <Link href="/preferiti">
                    <Heart className="h-4 w-4" />
                    Preferiti
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
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="text-gray-600 hover:text-gray-900"
                >
                  <Link href="/applications">
                    <FileText className="h-4 w-4" />
                    Applications
                  </Link>
                </Button>
              </>
            )}
            {isAdmin && (
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="text-gray-600 hover:text-gray-900"
              >
                <Link href="/admin">
                  <Settings className="h-4 w-4" />
                  Admin
                </Link>
              </Button>
            )}
            <UserMenu />
          </nav>
        </div>
      </div>
    </header>
  );
}
