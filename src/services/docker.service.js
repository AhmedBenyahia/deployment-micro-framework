import shell from 'shelljs';
import PropertiesReader from 'properties-reader';
import logger from '../utils/logger.utils';

export default {
  /**
   *  Pull the git repository, build a docker image and run it
   * @returns {Promise<void>}
   */
  buildAndRunContainer: async () => {
    if (!shell.which('git')) {
      shell.echo('Sorry, this script requires git');
      shell.exit(1);
    }
    shell.echo('######## Change dir to repository path ########');
    // eslint-disable-next-line no-unused-expressions
    !shell.cd(process.env.REPO_DIR).code &&
      shell.echo('######## Pulling git repo for updates ########') &&
      !shell.exec('git pull').code &&
      // shell.echo("######## Running mvn clean install ########") &&
      // !shell.exec('mvn clean install -DskipTests').code &&
      shell.echo('######## Building the docker container ########') &&
      !shell.exec('docker build -t ltm-api:webhook .').code &&
      shell.echo('######## Starting the docker container ########') &&
      shell.exec(
        'docker run -p 5005:5005 -p 3306:3306 --name ltm-api ltm-api:webhook',
        { async: true }, // mvn -N io.takari:maven:wrapper
      );
  },

  stopAppServer: () => {
    shell.echo('######## Stop and Delete the old container ########');
    // eslint-disable-next-line no-unused-expressions
    !shell.exec('docker stop ltm-api').code && shell.exec('docker rm ltm-api');
  },

  removeUnusedObject: () => {
    shell.exec('docker image prune -a -f');
    shell.exec('docker container prune -f');
  },

  cloneRepo: async () => {
    logger.debug(`Current Dir:${shell.pwd()}`);
    logger.info('######## Changing Working Dir ########');
    shell.cd(process.env.TMP_DIR);

    logger.debug(`Current Dir:${shell.pwd()}`);
    logger.info('######## Cloning the git repo ########');
    // eslint-disable-next-line no-unused-expressions
    shell.exec(`git clone ${process.env.REPO_URL}`).code;

    logger.info('######## Changing Working Dir ########');
    shell.cd(process.env.REPO_DIR);

    logger.info('######## Checkout deployment branch ########');
    // eslint-disable-next-line no-unused-expressions
    shell.exec(`git checkout ${process.env.REPO_BRANCH}`).code;
  },

  analyseProject: () => {
    const properties = PropertiesReader(
      `${process.env.REPO_DIR}/src/main/resources/application.properties`,
    );
    logger.debug(properties.get('spring.datasource.username'));
  },
};
