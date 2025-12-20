'use client';

import { Plus, Sparkles, Trash2, Youtube } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { siteConfig } from '~/lib/site';

interface OnboardingClientProps {
  userName: string;
}

const SUGGESTED_CATEGORIES = [
  'Music',
  'Gaming',
  'Tech',
  'Education',
  'Fitness',
  'Cooking',
  'Travel',
  'Comedy',
  'News',
  'Science',
];

export function OnboardingClient({ userName }: OnboardingClientProps) {
  const router = useRouter();
  const [categories, setCategories] = React.useState<string[]>([]);
  const [inputValue, setInputValue] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const addCategory = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;

    // Check for duplicates (case-insensitive)
    if (categories.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      toast.error('Category already added');
      return;
    }

    if (categories.length >= 20) {
      toast.error('Maximum 20 categories allowed');
      return;
    }

    setCategories([...categories, trimmed]);
    setInputValue('');
  };

  const removeCategory = (name: string) => {
    setCategories(categories.filter((c) => c !== name));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCategory(inputValue);
    }
  };

  const handleSubmit = async () => {
    if (categories.length === 0) {
      toast.error('Please add at least one category');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to complete onboarding');
      }

      toast.success('Setup complete! Syncing your videos...');
      router.push('/dashboard');
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Something went wrong'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-lg space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-600">
            <Youtube className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold">{siteConfig.name}</h1>
          <p className="mt-2 text-muted-foreground">
            Welcome, {userName}! Let&apos;s set up your video categories.
          </p>
        </div>

        {/* Instructions */}
        <div className="rounded-lg border bg-muted/50 p-4">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-5 w-5 text-primary" />
            <div className="text-sm">
              <p className="font-medium">How it works</p>
              <p className="mt-1 text-muted-foreground">
                Add the categories you want to organize your liked videos into.
                Our AI will automatically sort your videos. An &quot;Other&quot;
                category will be added for videos that don&apos;t match.
              </p>
            </div>
          </div>
        </div>

        {/* Category Input */}
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Enter a category (e.g., Gym/Workout)"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isSubmitting}
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => addCategory(inputValue)}
              disabled={isSubmitting || !inputValue.trim()}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {/* Suggestions */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Suggestions:</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_CATEGORIES.filter(
                (s) =>
                  !categories.some((c) => c.toLowerCase() === s.toLowerCase())
              ).map((suggestion) => (
                <Button
                  key={suggestion}
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => addCategory(suggestion)}
                  disabled={isSubmitting}
                >
                  {suggestion}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Added Categories */}
        {categories.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              Your categories ({categories.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => (
                <div
                  key={category}
                  className="flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-sm"
                >
                  <span>{category}</span>
                  <button
                    aria-label={`Remove ${category} category`}
                    onClick={() => removeCategory(category)}
                    disabled={isSubmitting}
                    className="ml-1 rounded-full p-0.5 hover:bg-primary/20"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <div className="flex items-center rounded-full bg-muted px-3 py-1 text-sm text-muted-foreground">
                Other (auto-added)
              </div>
            </div>
          </div>
        )}

        {/* Submit */}
        <Button
          className="w-full"
          size="lg"
          onClick={handleSubmit}
          disabled={isSubmitting || categories.length === 0}
        >
          {isSubmitting ? (
            <>
              <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
              Setting up...
            </>
          ) : (
            'Start Organizing My Videos'
          )}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          You can always add or remove categories later from the dashboard.
        </p>
      </div>
    </div>
  );
}
