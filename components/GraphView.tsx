import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { SparqlResponse, GraphNode, GraphLink } from '../types';

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

    // Process SPARQL results into Graph structure
    // We assume bindings contain ?s ?p ?o OR just generic columns we try to link
    // For specific structure visualization, we expect variables named 's', 'p', 'o'
    // or we assume row-based relationships.
    // Heuristic: If s, p, o exist, use them. Otherwise, create a central node for each row? 
    // Let's implement the Triples (s-p-o) heuristic primarily.
    
    const nodesMap = new Map<string, GraphNode>();
    const links: GraphLink[] = [];

    const getOrCreateNode = (val: string, type: 'uri' | 'literal' | 'bnode', isSubject = false): GraphNode => {
      if (!nodesMap.has(val)) {
        nodesMap.set(val, {
          id: val,
          group: isSubject ? 1 : 2,
          label: val.split('/').pop()?.split('#').pop() || val, // Simple label extraction
          type,
          x: width / 2 + (Math.random() - 0.5) * 50,
          y: height / 2 + (Math.random() - 0.5) * 50
        });
      }
      return nodesMap.get(val)!;
    };

    data.results.bindings.forEach((binding) => {
      // Check if this is an explicit S-P-O query
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
        // Fallback: If not S-P-O, visualize connection between first column and others
        const vars = Object.keys(binding);
        if (vars.length < 2) return;
        
        const rootVar = vars[0];
        const rootNode = getOrCreateNode(binding[rootVar].value, binding[rootVar].type as any, true);
        
        for (let i = 1; i < vars.length; i++) {
          const v = vars[i];
          const leafNode = getOrCreateNode(binding[v].value, binding[v].type as any, false);
          links.push({
            source: rootNode.id,
            target: leafNode.id,
            predicate: v
          });
        }
      }
    });

    const nodes = Array.from(nodesMap.values());

    // D3 Simulation
    const simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id((d: any) => d.id).distance(150))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide().radius(30));

    // Arrow markers
    svg.append("defs").selectAll("marker")
      .data(["end"])
      .enter().append("marker")
      .attr("id", "arrow")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 25) // Shift arrow back
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#999");

    const link = svg.append("g")
      .attr("class", "links")
      .selectAll("line")
      .data(links)
      .enter().append("g");

    const linkPath = link.append("line")
      .attr("stroke", "#999")
      .attr("stroke-opacity", 0.6)
      .attr("stroke-width", 1.5)
      .attr("marker-end", "url(#arrow)");

    const linkText = link.append("text")
      .text(d => d.predicate)
      .attr("font-size", "10px")
      .attr("fill", "#555")
      .attr("text-anchor", "middle")
      .style("pointer-events", "none");

    const node = svg.append("g")
      .attr("class", "nodes")
      .selectAll("g")
      .data(nodes)
      .enter().append("g")
      .call(d3.drag<SVGGElement, GraphNode>()
          .on("start", dragstarted)
          .on("drag", dragged)
          .on("end", dragended) as any);

    node.append("circle")
      .attr("r", 15)
      .attr("fill", d => d.group === 1 ? "#3b82f6" : (d.type === 'literal' ? "#10b981" : "#f59e0b"))
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5);

    node.append("text")
      .text(d => d.label.length > 20 ? d.label.substring(0, 20) + '...' : d.label)
      .attr("x", 18)
      .attr("y", 5)
      .style("font-size", "12px")
      .style("font-family", "Inter, sans-serif")
      .style("fill", "#333")
      .style("pointer-events", "none")
      .style("text-shadow", "1px 1px 0 #fff");

    node.append("title")
      .text(d => d.id);

    // Zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        svg.selectAll("g").attr("transform", event.transform);
      });

    svg.call(zoom);

    simulation.on("tick", () => {
      linkPath
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      linkText
        .attr("x", (d: any) => (d.source.x + d.target.x) / 2)
        .attr("y", (d: any) => (d.source.y + d.target.y) / 2 - 5);

      node
        .attr("transform", d => `translate(${d.x},${d.y})`);
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
    <div ref={wrapperRef} className="w-full h-full bg-slate-50 rounded-lg overflow-hidden border border-slate-200 shadow-inner relative">
       {(!data || data.results.bindings.length === 0) && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-400">
          <p>Run a query to visualize data</p>
        </div>
      )}
      <svg ref={svgRef} width={dimensions.width} height={dimensions.height} className="w-full h-full cursor-grab active:cursor-grabbing"></svg>
      
      <div className="absolute bottom-4 left-4 bg-white/90 p-3 rounded shadow backdrop-blur-sm text-xs border border-slate-200">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-3 h-3 rounded-full bg-blue-500"></span> Subject / Entity
        </div>
        <div className="flex items-center gap-2 mb-1">
          <span className="w-3 h-3 rounded-full bg-amber-500"></span> Object (URI/BNode)
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-emerald-500"></span> Literal Value
        </div>
      </div>
    </div>
  );
};

export default GraphView;