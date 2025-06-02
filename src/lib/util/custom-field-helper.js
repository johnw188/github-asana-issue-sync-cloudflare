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