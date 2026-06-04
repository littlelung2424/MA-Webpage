-- Keep intake attachment metadata durable while removing temporary signed URLs
-- from the JSONB values stored in Supabase.
-- New submissions write this shape directly; this migration normalizes older rows.

create or replace function public.normalize_intake_blob_file_metadata(file_value jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  url_path text := split_part(regexp_replace(coalesce(file_value->>'url', file_value->>'downloadUrl', ''), '^https?://[^/]+/', ''), '?', 1);
  stored_path text := regexp_replace(
    coalesce(nullif(file_value->>'blob_file_path', ''), nullif(file_value->>'pathname', ''), nullif(url_path, ''), ''),
    '^/+',
    ''
  );
  stored_filename text := coalesce(
    nullif(file_value->>'filename', ''),
    nullif(file_value->>'name', ''),
    nullif(file_value->>'blob_file_name', ''),
    nullif(substring(stored_path from '[^/]+$'), ''),
    ''
  );
  blob_filename text := coalesce(
    nullif(file_value->>'blob_file_name', ''),
    nullif(substring(stored_path from '[^/]+$'), ''),
    stored_filename
  );
  stored_size text := coalesce(nullif(file_value->>'size', ''), nullif(file_value->>'blob_file_size', ''));
  stored_content_type text := coalesce(nullif(file_value->>'content_type', ''), nullif(file_value->>'blob_file_content_type', ''));
  size_json jsonb := case
    when stored_size ~ '^[0-9]+$' then to_jsonb(stored_size::bigint)
    else 'null'::jsonb
  end;
begin
  if jsonb_typeof(file_value) <> 'object' then
    return file_value;
  end if;

  return (file_value - 'url' - 'downloadUrl') || jsonb_build_object(
    'pathname', stored_path,
    'filename', stored_filename,
    'size', size_json,
    'content_type', stored_content_type,
    'blob_file_path', stored_path,
    'blob_file_name', blob_filename,
    'blob_file_size', size_json,
    'blob_file_content_type', stored_content_type
  );
end;
$$;

update public.intake_submissions
set current_process_files = coalesce(
      (
        select jsonb_agg(public.normalize_intake_blob_file_metadata(file_value))
        from jsonb_array_elements(coalesce(current_process_files, '[]'::jsonb)) as file_entry(file_value)
      ),
      '[]'::jsonb
    ),
    desired_output_files = coalesce(
      (
        select jsonb_agg(public.normalize_intake_blob_file_metadata(file_value))
        from jsonb_array_elements(coalesce(desired_output_files, '[]'::jsonb)) as file_entry(file_value)
      ),
      '[]'::jsonb
    )
where jsonb_array_length(coalesce(current_process_files, '[]'::jsonb)) > 0
   or jsonb_array_length(coalesce(desired_output_files, '[]'::jsonb)) > 0;

drop function public.normalize_intake_blob_file_metadata(jsonb);
