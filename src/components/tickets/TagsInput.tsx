import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TagBadge } from "./TagBadge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface Tag {
  id: string;
  name: string;
  color: string | null;
}

interface TagsInputProps {
  selectedTagIds: string[];
  onChange: (tagIds: string[]) => void;
  disabled?: boolean;
  className?: string;
}

export function TagsInput({ selectedTagIds, onChange, disabled, className }: TagsInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: allTags = [] } = useQuery({
    queryKey: ["ticket-tags"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_tags")
        .select("id, name, color")
        .order("name");
      if (error) throw error;
      return data as Tag[];
    },
  });

  const selectedTags = useMemo(() => {
    return allTags.filter((tag) => selectedTagIds.includes(tag.id));
  }, [allTags, selectedTagIds]);

  const filteredTags = useMemo(() => {
    const searchLower = search.toLowerCase();
    return allTags.filter(
      (tag) =>
        !selectedTagIds.includes(tag.id) &&
        tag.name.toLowerCase().includes(searchLower)
    );
  }, [allTags, selectedTagIds, search]);

  const handleAddTag = (tagId: string) => {
    onChange([...selectedTagIds, tagId]);
    setSearch("");
  };

  const handleRemoveTag = (tagId: string) => {
    onChange(selectedTagIds.filter((id) => id !== tagId));
  };

  return (
    <div className={cn("space-y-2", className)}>
      {/* Selected tags */}
      <div className="flex flex-wrap gap-1 min-h-[24px]">
        {selectedTags.map((tag) => (
          <TagBadge
            key={tag.id}
            name={tag.name}
            color={tag.color || "#6b7280"}
            onRemove={disabled ? undefined : () => handleRemoveTag(tag.id)}
          />
        ))}
        
        {!disabled && (
          <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <Plus className="h-3 w-3 mr-1" />
                Adicionar
              </Button>
            </PopoverTrigger>
            <PopoverContent 
              className="w-64 p-2" 
              align="start"
              sideOffset={4}
            >
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar tag..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-8 pl-7 text-sm"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {filteredTags.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      {search ? "Nenhuma tag encontrada" : "Todas as tags já foram adicionadas"}
                    </p>
                  ) : (
                    filteredTags.map((tag) => (
                      <button
                        key={tag.id}
                        type="button"
                        className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted transition-colors text-left"
                        onClick={() => handleAddTag(tag.id)}
                      >
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: tag.color || "#6b7280" }}
                        />
                        {tag.name}
                      </button>
                    ))
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
}
