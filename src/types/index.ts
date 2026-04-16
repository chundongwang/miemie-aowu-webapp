export type User = {
  id: string;
  username: string;
  displayName: string;
};

export type List = {
  id: string;
  title: string;
  emoji: string;
  category: string;
  secondaryLabel: string | null;
  isPublic: boolean;
  ownerId: string;
  ownerUsername: string;
  ownerDisplayName: string;
  recipientId: string | null;
  recipientUsername: string | null;
  recipientDisplayName: string | null;
  itemCount: number;
  createdAt: number;
};

export type Item = {
  id: string;
  listId: string;
  name: string;
  secondary: string | null;
  reason: string | null;
  status: "unseen" | "saved" | "done";
  position: number;
  photos: ItemPhoto[];
  miemieCount: number;
  aowuCount: number;
  createdAt: number;
  updatedAt: number;
};

export type Comment = {
  id: string;
  listId: string;
  itemId: string | null;
  itemName: string | null;
  authorName: string;
  body: string;
  createdAt: number;
};

export type ItemPhoto = {
  id: string;
  r2Key: string;
  url: string;
  position: number;
};

export type ListDetail = List & { items: Item[] };

export const CATEGORIES: Record<
  string,
  { emoji: string; secondaryLabel: string; label: string }
> = {
  coffee:     { emoji: "☕", secondaryLabel: "Address",  label: "Coffee Shops" },
  music:      { emoji: "🎵", secondaryLabel: "Artist",   label: "Music"        },
  restaurant: { emoji: "🍜", secondaryLabel: "Address",  label: "Restaurants"  },
  book:       { emoji: "📚", secondaryLabel: "Author",   label: "Books"        },
  movie:      { emoji: "🎬", secondaryLabel: "Director", label: "Movies"       },
  custom:     { emoji: "📋", secondaryLabel: "",         label: "Custom"       },
  text:       { emoji: "📝", secondaryLabel: "",         label: "Notes"        },
};
