import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export type NodeType =
  | 'IDENTITY_USER'
  | 'IAM_ROLE'
  | 'COMPUTE_INSTANCE'
  | 'STORAGE_BUCKET'
  | 'DATABASE';

export interface GraphNode {
  id: string;
  name: string;
  type: NodeType;
  isCrownJewel?: boolean;
}

export interface GraphEdge {
  sourceId: string;
  targetId: string;
  relationship:
    | 'ASSUMES_ROLE'
    | 'CAN_EXECUTE'
    | 'HAS_READ_ACCESS'
    | 'NETWORK_PEERED'
    | 'KEY_DECRYPT_PERMISSION';
  weight: number;
}

export interface DiscoveredAttackPath {
  pathId: string;
  startNode: GraphNode;
  targetCrownJewel: GraphNode;
  pathHops: { from: string; to: string; relationship: string }[];
  totalRiskScore: number;
  criticalChokePointNodeId: string;
  remediationRecommendation: string;
  analysisDigest: string;
}

/**
 * Graph-Based Lateral Movement & Attack Path Discovery Engine
 * Specification: ZS-AI-SEC-001 §7 & ZS-SOC-FEED-001 §8
 */
@Injectable()
export class AttackPathDiscoveryService {
  private readonly logger = new Logger(AttackPathDiscoveryService.name);

  private nodes = new Map<string, GraphNode>();
  private adjacencyList = new Map<string, GraphEdge[]>();

  addNode(node: GraphNode): void {
    this.nodes.set(node.id, node);
    if (!this.adjacencyList.has(node.id)) {
      this.adjacencyList.set(node.id, []);
    }
  }

  addEdge(edge: GraphEdge): void {
    if (!this.adjacencyList.has(edge.sourceId)) {
      this.adjacencyList.set(edge.sourceId, []);
    }
    this.adjacencyList.get(edge.sourceId)!.push(edge);
  }

  /**
   * Finds the shortest lateral movement path from compromised initial entry point to crown jewel asset.
   */
  findShortestAttackPath(
    startNodeId: string,
    targetCrownJewelId: string,
  ): DiscoveredAttackPath | null {
    const startNode = this.nodes.get(startNodeId);
    const targetNode = this.nodes.get(targetCrownJewelId);

    if (!startNode || !targetNode) {
      throw new Error(
        `Invalid graph nodes: Start '${startNodeId}' or Target '${targetCrownJewelId}' not registered`,
      );
    }

    const queue: {
      nodeId: string;
      path: { from: string; to: string; relationship: string }[];
    }[] = [{ nodeId: startNodeId, path: [] }];
    const visited = new Set<string>([startNodeId]);

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current.nodeId === targetCrownJewelId) {
        // Path found!
        const pathId = `path-${crypto.randomUUID().slice(0, 8)}`;
        const totalRiskScore = 95 - current.path.length * 5;
        // Choke point is intermediate hop 1 or 2
        const chokePointIndex = Math.max(
          0,
          Math.floor(current.path.length / 2),
        );
        const criticalChokePointNodeId =
          current.path[chokePointIndex]?.from || startNodeId;

        const analysisDigest = crypto
          .createHash('sha256')
          .update(
            JSON.stringify({
              pathId,
              startNodeId,
              targetCrownJewelId,
              hops: current.path,
            }),
          )
          .digest('hex');

        const remediationRecommendation = `Sever relationship '${current.path[chokePointIndex]?.relationship || 'ACCESS'}' at node '${criticalChokePointNodeId}' to eliminate lateral progression.`;

        this.logger.warn(
          `🚨 [ATTACK PATH DISCOVERED] Path from ${startNode.name} to Crown Jewel ${targetNode.name} (${current.path.length} hops)! Choke point: ${criticalChokePointNodeId}`,
        );

        return {
          pathId,
          startNode,
          targetCrownJewel: targetNode,
          pathHops: current.path,
          totalRiskScore,
          criticalChokePointNodeId,
          remediationRecommendation,
          analysisDigest,
        };
      }

      const neighbors = this.adjacencyList.get(current.nodeId) || [];
      for (const edge of neighbors) {
        if (!visited.has(edge.targetId)) {
          visited.add(edge.targetId);
          queue.push({
            nodeId: edge.targetId,
            path: [
              ...current.path,
              {
                from: edge.sourceId,
                to: edge.targetId,
                relationship: edge.relationship,
              },
            ],
          });
        }
      }
    }

    return null; // No path exists
  }
}
