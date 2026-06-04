-- Store explicit Vercel Blob identifiers on every uploaded file object so admins
-- can find and eventually delete the matching private Blob from Vercel.
-- New submissions write these fields directly; this backfills existing JSONB rows.

update public.intake_submissions
set current_process_files = coalesce(
      (
        select jsonb_agg(
          case
            when jsonb_typeof(file_value) = 'object' then
              file_value || jsonb_build_object(
                'blob_file_path', coalesce(
                  nullif(file_value->>'blob_file_path', ''),
                  nullif(file_value->>'pathname', ''),
                  nullif(regexp_replace(coalesce(file_value->>'url', file_value->>'downloadUrl', ''), '^https?://[^/]+/', ''), coalesce(file_value->>'url', file_value->>'downloadUrl', '')),
                  ''
                ),
                'blob_file_name', coalesce(
                  nullif(file_value->>'blob_file_name', ''),
                  nullif(substring(coalesce(file_value->>'pathname', regexp_replace(coalesce(file_value->>'url', file_value->>'downloadUrl', ''), '^https?://[^/]+/', ''), '') from '[^/]+$'), ''),
                  nullif(file_value->>'name', ''),
                  ''
                )
              )
            else file_value
          end
        )
        from jsonb_array_elements(coalesce(current_process_files, '[]'::jsonb)) as file_entry(file_value)
      ),
      '[]'::jsonb
    ),
    desired_output_files = coalesce(
      (
        select jsonb_agg(
          case
            when jsonb_typeof(file_value) = 'object' then
              file_value || jsonb_build_object(
                'blob_file_path', coalesce(
                  nullif(file_value->>'blob_file_path', ''),
                  nullif(file_value->>'pathname', ''),
                  nullif(regexp_replace(coalesce(file_value->>'url', file_value->>'downloadUrl', ''), '^https?://[^/]+/', ''), coalesce(file_value->>'url', file_value->>'downloadUrl', '')),
                  ''
                ),
                'blob_file_name', coalesce(
                  nullif(file_value->>'blob_file_name', ''),
                  nullif(substring(coalesce(file_value->>'pathname', regexp_replace(coalesce(file_value->>'url', file_value->>'downloadUrl', ''), '^https?://[^/]+/', ''), '') from '[^/]+$'), ''),
                  nullif(file_value->>'name', ''),
                  ''
                )
              )
            else file_value
          end
        )
        from jsonb_array_elements(coalesce(desired_output_files, '[]'::jsonb)) as file_entry(file_value)
      ),
      '[]'::jsonb
    )
where jsonb_array_length(coalesce(current_process_files, '[]'::jsonb)) > 0
   or jsonb_array_length(coalesce(desired_output_files, '[]'::jsonb)) > 0;
