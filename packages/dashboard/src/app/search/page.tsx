import { PlaceholderPage } from "@/components/placeholder-page";

export const dynamic = "force-dynamic";

export default function SearchPage(): React.JSX.Element {
  return (
    <PlaceholderPage
      title="Search"
      description="Semantic + filter search across every memory in your workspace. Coming soon."
      hint="Today you can still search via the MCP console (Engram's `search_memories` tool) or Claude Code."
    />
  );
}
