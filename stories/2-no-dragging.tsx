import _ from "lodash";
import React from "react";
import RGL, {WidthProvider} from "react-grid-layout-hooks";

const ReactGridLayout = WidthProvider(RGL);

const NoDraggingLayout = (props) => {

  const [state, setState] = React.useState({
    layout: undefined
  })

  React.useEffect(() => {
    setState(prevState => ({
      ...prevState,
      layout: _.map(new Array(props.items), function(item, i) {
        var y = _.result(props, "y") || Math.ceil(Math.random() * 4) + 1;
        return {
          x: (i * 2) % 12,
          y: Math.floor(i / 6) * y,
          w: 2,
          h: y,
          i: i.toString()
        };
      })
    }));
  }, [])

  return (
          <div style={{
            height: `100%`
          }}>
            {state?.layout && (
                    <ReactGridLayout
                            layout={state.layout}
                            onLayoutChange={(layout) => {
                              props.onLayoutChange(layout);
                            }}
                            {...props}
                    >
                      {_.map(_.range(props.items), function(i) {
                        return (
                                <div key={i}>
                                  <span className="text">{i}</span>
                                </div>
                        );
                      })}
                    </ReactGridLayout>
            )}
          </div>
  );
}


NoDraggingLayout.defaultProps = {
  className: "layout",
  isDraggable: false,
  isResizable: false,
  items: 50,
  cols: 12,
  rowHeight: 30,
  onLayoutChange: function() {
  }
};

export default NoDraggingLayout