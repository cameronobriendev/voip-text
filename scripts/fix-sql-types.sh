#!/bin/bash

# Fix SQL type arguments in all API files
# Replace: const var = await sql<Type[]>`...`
# With: const var: Type[] = await sql`...`

cd /Users/camobrien/Documents/GitHub/textable

# Fix pattern: sql<Type[]>` -> sql` and add : Type[] to variable
find api -name "*.ts" -type f | while read file; do
  # Simple sed replacement
  sed -i '' 's/await sql<\([^>]*\)>`/: \1 = await sql`/g' "$file"
  sed -i '' 's/= await sql<\([^>]*\)>`/: \1 = await sql`/g' "$file"
  echo "Fixed: $file"
done

echo "All SQL type arguments fixed!"
