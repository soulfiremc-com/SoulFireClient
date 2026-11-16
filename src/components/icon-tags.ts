import tags from "lucide-static/tags.json" with { type: "json" };

export function getAllIconTags() {
  return Object.entries(tags);
}
