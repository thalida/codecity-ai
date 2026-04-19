module.exports = function CodeCityPlugin({ client, directory }) {
  return {
    config(config) {
      const path = require('path');
      const skillsDir = path.join(directory, 'skills');
      config.skills = config.skills || {};
      config.skills.paths = config.skills.paths || [];
      config.skills.paths.push(skillsDir);
      return config;
    }
  };
};
