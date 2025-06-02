// Custom field helper for Asana repository tagging

export async function getCustomFieldForProject(asanaAPI, customFieldGid, repository) {
  try {
    if (!asanaAPI || !customFieldGid || !repository) {
      console.log('Missing parameters for custom field:', { asanaAPI: !!asanaAPI, customFieldGid, repository });
      return null;
    }
    
    // Get the custom field with its options
    const opts = { opt_fields: "enum_options,enum_options.name" };
    const customField = await asanaAPI.getCustomField(customFieldGid, opts);
    
    // Check if the repository option already exists
    const existingOption = customField.enum_options?.find(
      option => option.name === repository
    );
    
    if (existingOption) {
      return existingOption.gid;
    }
    
    // Create a new option if it doesn't exist
    const newOptionData = {
      data: {
        name: repository,
        color: getColorForRepository(repository)
      }
    };
    
    const newOption = await asanaAPI.createEnumOptionForCustomField(
      customFieldGid,
      newOptionData
    );
    
    console.log(`Created new custom field option for repository: ${repository}`);
    return newOption.gid;
    
  } catch (error) {
    console.error("Error handling custom field:", error);
    throw error;
  }
}

// Handle multi-enum fields (like Labels)
export async function getMultiEnumOptionsForField(asanaAPI, customFieldGid, values) {
  try {
    if (!asanaAPI || !customFieldGid || !values || values.length === 0) {
      return [];
    }
    
    // Get the custom field with its options
    const opts = { opt_fields: "enum_options,enum_options.name,resource_subtype" };
    const customField = await asanaAPI.getCustomField(customFieldGid, opts);
    
    if (customField.resource_subtype !== 'multi_enum') {
      console.warn(`Custom field ${customFieldGid} is not a multi_enum field`);
      return [];
    }
    
    const optionGids = [];
    
    for (const value of values) {
      // Check if the option already exists
      const existingOption = customField.enum_options?.find(
        option => option.name === value
      );
      
      if (existingOption) {
        optionGids.push(existingOption.gid);
      } else {
        // Create a new option if it doesn't exist
        const newOptionData = {
          data: {
            name: value,
            color: getColorForLabel(value)
          }
        };
        
        const newOption = await asanaAPI.createEnumOptionForCustomField(
          customFieldGid,
          newOptionData
        );
        
        console.log(`Created new label option: ${value}`);
        optionGids.push(newOption.gid);
      }
    }
    
    return optionGids;
    
  } catch (error) {
    console.error("Error handling multi-enum field:", error);
    return [];
  }
}

function getColorForRepository(repository) {
  // Valid Asana enum colors
  const colors = [
    'red', 'orange', 'yellow-orange', 'yellow', 
    'yellow-green', 'green', 'blue-green', 'aqua', 
    'blue', 'indigo', 'purple', 'magenta', 
    'hot-pink', 'pink', 'cool-gray'
  ];
  
  // Simple hash function to consistently assign colors
  let hash = 0;
  for (let i = 0; i < repository.length; i++) {
    hash = ((hash << 5) - hash) + repository.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  
  return colors[Math.abs(hash) % colors.length];
}

function getColorForLabel(label) {
  // Map common GitHub labels to appropriate colors
  const labelColorMap = {
    'bug': 'red',
    'enhancement': 'green', 
    'feature': 'green',
    'documentation': 'blue',
    'help wanted': 'yellow',
    'good first issue': 'yellow-green',
    'priority: high': 'hot-pink',
    'priority: medium': 'orange', 
    'priority: low': 'cool-gray',
    'question': 'purple',
    'wontfix': 'cool-gray',
    'duplicate': 'cool-gray',
    'invalid': 'cool-gray'
  };
  
  // Check for exact match first
  const exactMatch = labelColorMap[label.toLowerCase()];
  if (exactMatch) {
    return exactMatch;
  }
  
  // Check for partial matches
  const lowerLabel = label.toLowerCase();
  if (lowerLabel.includes('bug') || lowerLabel.includes('error')) return 'red';
  if (lowerLabel.includes('feature') || lowerLabel.includes('enhancement')) return 'green';
  if (lowerLabel.includes('doc')) return 'blue';
  if (lowerLabel.includes('priority') || lowerLabel.includes('urgent')) return 'hot-pink';
  if (lowerLabel.includes('help') || lowerLabel.includes('question')) return 'purple';
  
  // Fall back to hash-based color assignment
  return getColorForRepository(label);
}