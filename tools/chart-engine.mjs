import { use, init, getInstanceByDom } from 'echarts/core';
import { LineChart, BarChart, PieChart } from 'echarts/charts';
import {
  GridComponent,
  GraphicComponent,
  MarkLineComponent,
} from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
use([
  LineChart,
  BarChart,
  PieChart,
  GridComponent,
  GraphicComponent,
  MarkLineComponent,
  SVGRenderer,
]);
export { init, getInstanceByDom };
