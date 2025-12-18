
import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { SparqlResponse, GraphNode, GraphLink } from '../types';
import { Share2 } from 'lucide-react';

interface GraphViewProps {
  data: SparqlResponse | null;
}

const GraphView: React.FC<GraphViewProps> = ({ data }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Handle Resize
  useEffect(() => {
    if (!wrapperRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    resizeObserver.observe(wrapperRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (!data || !data.results.bindings.length || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); // Clear previous graph

    const width = dimensions.width;
    const height = dimensions.height;

    // Create a single container group for all graph elements. 
    // Zoom/Pan will be applied ONLY to this group.
    const container = svg.append("g").attr("class", "zoom-container");

    const nodesMap = new Map<string, GraphNode>();
    const links: GraphLink[] = [];

    const getOrCreateNode = (val: string, type: 'uri' | 'literal' | 'bnode', isSubject = false): GraphNode => {
      if (!nodesMap.has(val)) {
        nodesMap.set(val, {
          id: val,
          group: isSubject ? 1 : 2,
          label: val.split('/').pop()?.split('#').pop() || val,
          type,
          x: width / 2 + (Math.random() - 0.5) * 100,
          y: height / 2 + (Math.random() - 0.5) * 100
        });
      }
      return nodesMap.get(val)!;
    };

    data.results.bindings.forEach((binding) => {
      // Use explicit s-p-o or first column as subject
      if (binding.s && binding.p && binding.o) {
        const source = getOrCreateNode(binding.s.value, binding.s.type as any, true);
        const target = getOrCreateNode(binding.o.value, binding.o.type as any, false);
        const predicate = binding.p.value;
        
        links.push({
          source: source.id,
          target: target.id,
          predicate: predicate.split('/').pop()?.split('#').pop() || predicate
        });
      } else {
        const vars = Object.keys(binding);
        if (vars.length < 2) return;
        
        const rootVar = vars[0];
        const rootNode = getOrCreateNode(binding[rootVar].value, binding[rootVar].type as any, true);
        
        for (let i = 1; i < vars.length; i++) {
          const v = vars[i];
          if (binding[v]) {
            const leafNode = getOrCreateNode(binding[v].value, binding[v].type as any, false);
            links.push({
              source: rootNode.id,
              target: leafNode.id,
              predicate: v
            });
          }
        }
      }
    });

    const nodes = Array.from(nodesMap.values());

    // D3 Simulation setup
    const simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id((d: any) => d.id).distance(220))
      .force("charge", d3.forceManyBody().strength(-600))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide().radius(50));

    // Arrow markers
    const defs = svg.append("defs");
    defs.append("marker")
      .attr("id", "arrowhead")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 30) 
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#94a3b8");

    // Zoom behavior - Apply to SVG but transform the CONTAINER group
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 8])
      .on("zoom", (event) => {
        container.attr("transform", event.transform);
      });

    svg.call(zoom);

    // Drawing Links
    const linkLayer = container.append("g").attr("class", "links");
    
    const linkGroup = linkLayer.selectAll("g")
      .data(links)
      .enter().append("g");

    const linkPath = linkGroup.append("line")
      .attr("stroke", "#cbd5e1")
      .attr("stroke-opacity", 0.6)
      .attr("stroke-width", 1.5)
      .attr("marker-end", "url(#arrowhead)");

    const linkText = linkGroup.append("text")
      .text(d => d.predicate)
      .attr("font-size", "10px")
      .attr("fill", "#64748b")
      .attr("text-anchor", "middle")
      .style("pointer-events", "none")
      .style("font-weight", "500");

    // Drawing Nodes
    const nodeLayer = container.append("g").attr("class", "nodes");

    const nodeGroup = nodeLayer.selectAll("g")
      .data(nodes)
      .enter().append("g")
      .call(d3.drag<SVGGElement, GraphNode>()
          .on("start", dragstarted)
          .on("drag", dragged)
          .on("end", dragended) as any);

    nodeGroup.append("circle")
      .attr("r", 16)
      .attr("fill", d => d.group === 1 ? "#3b82f6" : (d.type === 'literal' ? "#10b981" : "#f59e0b"))
      .attr("stroke", "#fff")
      .attr("stroke-width", 2)
      .attr("class", "shadow-sm hover:stroke-slate-400 cursor-pointer");

    nodeGroup.append("text")
      .text(d => d.label.length > 25 ? d.label.substring(0, 25) + '...' : d.label)
      .attr("x", 20)
      .attr("y", 5)
      .style("font-size", "11px")
      .style("font-weight", "600")
      .style("fill", "#1e293b")
      .style("pointer-events", "none")
      .style("text-shadow", "0px 0px 4px #fff, 0px 0px 4px #fff");

    nodeGroup.append("title").text(d => d.id);

    simulation.on("tick", () => {
      linkPath
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      linkText
        .attr("x", (d: any) => (d.source.x + d.target.x) / 2)
        .attr("y", (d: any) => (d.source.y + d.target.y) / 2 - 5);

      nodeGroup.attr("transform", d => `translate(${d.x},${d.y})`);
    });

    function dragstarted(event: any, d: GraphNode) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: any, d: GraphNode) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: any, d: GraphNode) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    return () => {
      simulation.stop();
    };
  }, [data, dimensions]);

  return (
    <div ref={wrapperRef} className="w-full h-full bg-white rounded-xl overflow-hidden border border-slate-200 shadow-inner relative">
       {(!data || data.results.bindings.length === 0) && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-400 bg-slate-50/50">
          <p className="flex items-center gap-2 font-medium">
            <Share2 size={18} />
            Run a query to visualize the knowledge graph
          </p>
        </div>
      )}
      <svg ref={svgRef} width={dimensions.width} height={dimensions.height} className="w-full h-full cursor-grab active:cursor-grabbing">
        {/* Graph will be rendered here */}
      </svg>
      
      <div className="absolute bottom-4 left-4 bg-white/80 p-3 rounded-lg shadow-sm backdrop-blur-md text-[10px] border border-slate-200 flex flex-col gap-1.5 uppercase tracking-wider font-bold text-slate-500 z-10">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-blue-500 ring-2 ring-blue-100"></span> Subject / Entity
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-amber-500 ring-2 ring-amber-100"></span> Object (URI/BNode)
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-emerald-100"></span> Literal Value
        </div>
      </div>
    </div>
  );
};

export default GraphView;
