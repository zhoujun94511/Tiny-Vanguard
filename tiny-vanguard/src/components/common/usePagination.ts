import { computed, isRef, ref, watch, type Ref } from 'vue';

export function calcTotalPages(totalItems: number, pageSize: number): number {
  const safeSize = Math.max(1, Math.floor(pageSize));
  return Math.max(1, Math.ceil(Math.max(0, totalItems) / safeSize));
}

export function clampPage(page: number, totalPages: number): number {
  const maxPage = Math.max(1, Math.floor(totalPages));
  return Math.max(1, Math.min(maxPage, Math.floor(page)));
}

export function slicePageItems<T>(
  items: readonly T[],
  page: number,
  pageSize: number
): readonly T[] {
  const safeSize = Math.max(1, Math.floor(pageSize));
  const totalPages = calcTotalPages(items.length, safeSize);
  const safePage = clampPage(page, totalPages);
  const start = (safePage - 1) * safeSize;
  return items.slice(start, start + safeSize);
}

export function resolvePageForIndex(
  index: number,
  pageSize: number,
  totalItems: number
): number {
  if (index <= 0 || totalItems <= 0) return 1;
  const safeSize = Math.max(1, Math.floor(pageSize));
  const rawPage = Math.floor(index / safeSize) + 1;
  return clampPage(rawPage, calcTotalPages(totalItems, safeSize));
}

export function usePagination<T>(
  items: Ref<readonly T[]>,
  pageSize: Ref<number> | number
) {
  const resolvedPageSize = computed(() =>
    Math.max(1, Math.floor(isRef(pageSize) ? pageSize.value : pageSize))
  );
  const currentPage = ref(1);

  const totalPages = computed(() =>
    calcTotalPages(items.value.length, resolvedPageSize.value)
  );

  watch([() => items.value.length, resolvedPageSize], () => {
    currentPage.value = clampPage(currentPage.value, totalPages.value);
  });

  const startIndex = computed(
    () => (clampPage(currentPage.value, totalPages.value) - 1) * resolvedPageSize.value
  );

  const pagedItems = computed(() =>
    slicePageItems(items.value, currentPage.value, resolvedPageSize.value)
  );

  const hasPrev = computed(() => currentPage.value > 1);
  const hasNext = computed(() => currentPage.value < totalPages.value);

  function goToPage(page: number): void {
    currentPage.value = clampPage(page, totalPages.value);
  }

  function prevPage(): void {
    goToPage(currentPage.value - 1);
  }

  function nextPage(): void {
    goToPage(currentPage.value + 1);
  }

  function jumpToIndex(index: number): void {
    currentPage.value = resolvePageForIndex(index, resolvedPageSize.value, items.value.length);
  }

  return {
    currentPage,
    totalPages,
    pageSize: resolvedPageSize,
    startIndex,
    pagedItems,
    hasPrev,
    hasNext,
    goToPage,
    prevPage,
    nextPage,
    jumpToIndex,
  };
}
