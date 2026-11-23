// Names used by the Dashboard and Data screens, which have not moved to the page-folder layout yet.
// New code imports from the owning page's queries folder instead.
export {
  useGetPosts as usePosts,
  useGetPost as usePost,
  useGetOverview as useOverview,
  useGetDueSnapshots as useDueSnapshots,
  useGetPageAudience as usePageAudience,
  useGetPageDaily as usePageDaily,
  useSavePost,
  useDeletePost,
  useSaveSnapshot,
  useDeleteSnapshot,
  useSavePostAudience as useSaveAudience,
  useSavePageAudience,
  useDeletePageAudience,
  useImportCsv,
  useImportLinkedInExport,
} from '@/pages/data/queries'
export { useGetAccountDoc as useAccountDoc } from '@/pages/brand/queries'
export { useGetPlannedPosts as usePlanned } from '@/pages/publishing/queries'
