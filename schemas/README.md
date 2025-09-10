# OTIO Lite Schema Definitions

This directory contains JSON Schema definitions for each version of the OpenTimeline Lite format.

## Schema Files

- **[v0.0.2.json](./v0.0.2.json)** - Initial experimental version with basic video/audio support
- **[v0.0.3.json](./v0.0.3.json)** - Current version with subtitle tracks and extended metadata
- **[version-changelog.md](./version-changelog.md)** - Detailed changelog and migration guide

## Using Schemas for Validation

### JavaScript Example

```javascript
import Ajv from 'ajv';
import { readFile } from 'fs/promises';

async function validateTimeline(timelineFile) {
  const timeline = JSON.parse(await readFile(timelineFile, 'utf-8'));
  const version = timeline.version || '0.0.3';
  
  // Load appropriate schema
  const schema = JSON.parse(
    await readFile(`schemas/v${version}.json`, 'utf-8')
  );
  
  // Validate
  const ajv = new Ajv();
  const validate = ajv.compile(schema);
  const valid = validate(timeline);
  
  if (!valid) {
    console.error('Validation errors:', validate.errors);
    return false;
  }
  
  return true;
}
```

### Version Detection

```javascript
function detectVersion(timeline) {
  // Explicit version field
  if (timeline.version) {
    return timeline.version;
  }
  
  // Heuristic detection for older files
  const hasSubtitles = timeline.tracks?.some(t => t.kind === 'subtitle');
  const hasEnabledField = timeline.tracks?.some(t => 'enabled' in t);
  
  if (hasSubtitles || hasEnabledField) {
    return '0.0.3';
  }
  
  return '0.0.2';
}
```

## Schema Evolution Strategy

### Backwards Compatibility
- New optional fields can be added without breaking compatibility
- Parsers should ignore unknown fields for forward compatibility
- Required fields should rarely change between versions

### Version Migration
- Each version includes example upgrade functions
- Automated migration tools planned for v0.1.0+
- Version detection supports files without explicit version field

### Testing Schemas

```bash
# Validate a timeline against its schema
npx ajv validate -s schemas/v0.0.3.json -d examples/timeline.json

# Test all examples
for file in examples/*.json; do
  version=$(jq -r .version "$file")
  npx ajv validate -s "schemas/v${version}.json" -d "$file"
done
```

## Schema Design Principles

1. **Simplicity First** - Keep required fields minimal
2. **Extensible Metadata** - Allow custom fields in metadata objects
3. **Time in Seconds** - All time values are floating-point seconds
4. **Progressive Enhancement** - New versions add capabilities without breaking old ones
5. **Clear Deprecation** - Mark deprecated fields clearly, remove after 2 major versions

## Contributing

When adding new schema versions:

1. Copy the latest schema file
2. Update the version constant
3. Add new fields with descriptions
4. Include migration examples
5. Update the changelog
6. Add validation tests