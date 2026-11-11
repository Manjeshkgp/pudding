"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { requestApi } from "@/lib/client-api";

type Item = { id: string };
type Page<T> = { items: T[]; nextCursor: string | null; unreadCount?: number };

export function usePagedList<T extends Item>(path: string | null) {
  const [state, setState] = useState<Page<T> & { path: string | null }>({
    path: null,
    items: [],
    nextCursor: null,
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const active = useRef<AbortController | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const fetchPage = useCallback(
    async (cursor?: string) => {
      if (!path) return;
      if (cursor && active.current) return;
      active.current?.abort();
      const controller = new AbortController();
      active.current = controller;
      setPending(true);
      setError("");
      try {
        const url = new URL(path, window.location.origin);
        if (cursor) url.searchParams.set("cursor", cursor);
        const page = await requestApi<Page<T>>(url.pathname + url.search, {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setState((current) => ({
          ...page,
          path,
          items:
            cursor && current.path === path
              ? [
                  ...new Map(
                    [...current.items, ...page.items].map((item) => [
                      item.id,
                      item,
                    ]),
                  ).values(),
                ]
              : page.items,
        }));
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : "Couldn’t load this list.",
          );
      } finally {
        if (active.current === controller) {
          active.current = null;
          setPending(false);
        }
      }
    },
    [path],
  );

  useEffect(() => {
    if (path) void fetchPage();
    else {
      setPending(false);
      setError("");
    }
    return () => {
      active.current?.abort();
      active.current = null;
    };
  }, [path, fetchPage]);

  const cursor = state.path === path ? state.nextCursor : null;
  const loadMore = useCallback(() => {
    if (cursor) void fetchPage(cursor);
  }, [cursor, fetchPage]);

  useEffect(() => {
    const target = sentinel.current;
    if (
      !target ||
      !cursor ||
      pending ||
      error ||
      typeof IntersectionObserver === "undefined"
    )
      return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) loadMore();
      },
      { rootMargin: "200px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [cursor, pending, error, loadMore]);

  return {
    items: state.path === path ? state.items : [],
    unreadCount: state.path === path ? state.unreadCount : undefined,
    loading: Boolean(
      path &&
        !error &&
        (state.path !== path || (pending && !state.items.length)),
    ),
    pending,
    error,
    hasMore: Boolean(cursor),
    sentinel,
    loadMore,
    reload: () => fetchPage(),
    updateItems: (
      update: (items: T[]) => T[],
      unread?: (current: number | undefined) => number | undefined,
    ) =>
      setState((current) =>
        current.path === path
          ? {
              ...current,
              items: update(current.items),
              unreadCount: unread
                ? unread(current.unreadCount)
                : current.unreadCount,
            }
          : current,
      ),
  };
}

export function ListEnd({
  list,
}: {
  list: Pick<
    ReturnType<typeof usePagedList<Item>>,
    "sentinel" | "hasMore" | "pending" | "error" | "loadMore" | "reload"
  >;
}) {
  if (!list.hasMore && !list.error) return null;
  return (
    <div ref={list.sentinel} className="flex justify-center py-3">
      <button
        type="button"
        disabled={list.pending}
        onClick={list.hasMore ? list.loadMore : list.reload}
        className="rounded-full bg-[#f3f3f3] px-5 py-3 text-sm font-semibold disabled:opacity-60"
      >
        {list.pending ? "Loading…" : list.error ? "Retry" : "Load more"}
      </button>
    </div>
  );
}
