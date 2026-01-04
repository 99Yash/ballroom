'use client';

import { Plus, Settings2, Trash2 } from 'lucide-react';
import * as React from 'react';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { Modal } from '~/components/ui/modal';
import { Spinner } from '~/components/ui/spinner';
import type { Category } from '~/types/category';

interface CategoryManagerProps {
  categories: Category[];
  onCategoryAdded?: (category: Category) => void;
  onCategoryDeleted?: (categoryId: string) => void;
  onCategoriesChanged?: () => void;
}

export function CategoryManager({
  categories,
  onCategoryAdded,
  onCategoryDeleted,
  onCategoriesChanged,
}: CategoryManagerProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [newCategoryName, setNewCategoryName] = React.useState('');
  const [isAdding, setIsAdding] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;

    setIsAdding(true);
    setError(null);

    try {
      const response = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCategoryName.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.suggestion
            ? `${data.error}: ${data.reason}. Try "${data.suggestion}" instead.`
            : data.error
        );
      }

      onCategoryAdded?.(data.category);
      onCategoriesChanged?.();
      setNewCategoryName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add category');
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    setDeletingId(categoryId);

    try {
      const response = await fetch(`/api/categories/${categoryId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete category');
      }

      onCategoryDeleted?.(categoryId);
      onCategoriesChanged?.();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to delete category'
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        className="gap-2"
        onClick={() => setIsOpen(true)}
      >
        <Settings2 className="h-4 w-4" />
        Manage Categories
      </Button>
      <Modal showModal={isOpen} setShowModal={setIsOpen} className="max-w-md">
        <DialogHeader>
          <DialogTitle>Manage Categories</DialogTitle>
          <DialogDescription>
            Add or remove categories for organizing your liked videos. AI will
            use these categories to automatically sort your videos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="New category name..."
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
              disabled={isAdding}
            />
            <Button
              onClick={handleAddCategory}
              disabled={isAdding || !newCategoryName.trim()}
              size="icon"
            >
              {isAdding ? (
                <Spinner className="h-4 w-4" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
            </Button>
          </div>

          {error && (
            <p className="text-sm text-destructive animate-in fade-in">
              {error}
            </p>
          )}

          <div className="max-h-[300px] space-y-2 overflow-y-auto">
            {categories.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No categories yet. Add one above!
              </p>
            ) : (
              categories.map((category) => (
                <div
                  key={category.id}
                  className="flex items-center justify-between rounded-lg border bg-card p-3 gap-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="text-sm font-medium truncate"
                      title={category.name}
                    >
                      {category.name}
                    </span>
                    {category.isDefault && (
                      <Badge variant="secondary" className="text-xs shrink-0">
                        Default
                      </Badge>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleDeleteCategory(category.id)}
                    disabled={deletingId === category.id}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    {deletingId === category.id ? (
                      <Spinner className="h-4 w-4" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Done
          </Button>
        </DialogFooter>
      </Modal>
    </>
  );
}
