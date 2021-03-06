import debug from 'debug';
import { ApplicationError } from '../helpers/errors.helper';
import containerService from '../services/docker.service';

const DEBUG = debug('dev');
const {
  stopAppServer,
  buildAndRunContainer,
  cloneRepo,
  getProjectConfiguration,
  createDockerFile,
} = containerService;

export default {
  buildAndRunContainer: async (req, res) => {
    try {
      DEBUG(req.body);
      res.status(202).send('OK');
      stopAppServer();
      // removeUnusedObject()
      await buildAndRunContainer();
    } catch (error) {
      DEBUG(error);
      throw new ApplicationError(500, error);
    }
  },
  initProject: async (req, res) => {
    try {
      DEBUG(req.body);
      res.status(202).send('OK');
      await cloneRepo();
      const params = await getProjectConfiguration();
      await createDockerFile(params);
    } catch (error) {
      DEBUG(error);
      throw new ApplicationError(500, error);
    }
  },
};
