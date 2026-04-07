-- Enable realtime updates for feed_items table
-- Required for the useFeed hook's postgres_changes subscription
alter publication supabase_realtime add table feed_items;
