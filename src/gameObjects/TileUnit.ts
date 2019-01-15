import * as PF from 'pathfinding';
import { Unit } from '../logic/Unit';

import { Game } from '../scenes/Game';

import gameConst from '../const/GameConst';

export default class TileUnit extends Phaser.GameObjects.GameObject {

  private isAnimating: boolean = false;

  private sprite: any;

  private tile: Phaser.Tilemaps.Tile;

  private tilesMovement: Phaser.Tilemaps.Tile[] = [];

  private tilesAttackRange: Phaser.Tilemaps.Tile[] = [];

  private tilesPath: Phaser.Tilemaps.Tile[] = [];

  private unit: Unit;

  constructor({ scene, tile, createUnit }:
    { scene: Phaser.Scene, tile: Phaser.Tilemaps.Tile, createUnit: (hero: string) => Unit }) {

    super(scene, 'TileUnit');

    this.sprite = this.createUnitSprite(tile);
    this.unit = createUnit(tile.properties.unitName); // TODO: PR in Phaser for properties: any
    this.tile = tile;

    this.once('destroy', () => {
      this.sprite.destroy();
    });
  }

  /**
   * Add sprite animation to tile.
   */
  public bringToFront() {
    this.tile.setAlpha(0);
    this.sprite.setAlpha(1);

    this.scene.tweens.timeline({
      targets: this.sprite,
      loop: -1,
      yoyo: true,

      tweens: [
        {
          scaleX: 1.4,
          scaleY: 1.4,
          duration: 500,
          ease: 'Power1',
        },
        {
          scaleX: 1.7,
          scaleY: 1.7,
          duration: 500,
          ease: 'Power1',
        }],
    });

    return this
      .showAllowedMovement()
      .showWeaponRange();
  }

  public createUnitSprite(tile: Phaser.Tilemaps.Tile) {
    // const { scene } = tile.layer.tilemapLayer;
    const { scene } = this;

    const { x, y } = tile.layer.tilemapLayer.tileToWorldXY(tile.x, tile.y);
    const id = Number.parseInt(tile.properties.spritesIds, 10);

    const deltaToCenter = tile.height / 1.4;

    return scene.add
      .sprite(x + deltaToCenter, y + deltaToCenter, 'charactersSheet', id)
      .setScale(1.4)
      .setAlpha(0);
  }

  /**
   * Find the adjacent allowed movement and add the tiles found to a layer and an array.
   * @param {coordinates} param0 Coordinate to check the adjacent tile movement.
   * @param {Number} param0.x X coordinate.
   * @param {Number} param0.y Y coordinate.
   * @param {Number} remainingMove Max character's movement.
   */
  public findValidNeighbours(params: ParamsFindNeighbours) {
    const { coord: { x, y }, remainingMove } = params;

    if (remainingMove === 0) { return; }

    const { layers } = Game.gameMap;

    const layerMovement = layers.movement as Phaser.Tilemaps.DynamicTilemapLayer;

    // 1.Bounds check
    if (x >= layerMovement.tilemap.width ||
      y >= layerMovement.tilemap.height ||
      x < 0 || y < 0) {
      return;
    }

    // 2.Collision Environment check
    if (layers.collision.hasTileAt(x, y)) { return; }

    // 3.Collision Character check
    const character = layers.characters.getTileAt(x, y);

    if (character &&
      character.x !== this.tile.x &&
      character.y !== this.tile.y) {
      return;
    }

    // 4.Avoid tile duplication
    if (!layerMovement.hasTileAt(x, y)) {
      const tileMovement = layerMovement.putTileAt(2569, x, y);

      // Alpha will be animate later to show movement
      tileMovement.setAlpha(0);

      this.tilesMovement.push(tileMovement);
    }

    const newRemainingMove = remainingMove - 1;

    const coordUp     = { x, y: y - 1 };
    const coordDown   = { x, y: y + 1 };
    const coordLeft   = { x: x - 1, y };
    const coordRight  = { x: x + 1, y };

    this.findValidNeighbours({ coord: coordUp, remainingMove: newRemainingMove });
    this.findValidNeighbours({ coord: coordDown, remainingMove: newRemainingMove });
    this.findValidNeighbours({ coord: coordLeft, remainingMove: newRemainingMove });
    this.findValidNeighbours({ coord: coordRight, remainingMove: newRemainingMove });
  }

  public getCharacterPath({ startX = 0, startY = 0 }, { endX = 0, endY = 0 }) {
    const { mapMatrix } = Game.gameMap;

    const grid = new PF.Grid(mapMatrix);
    const finder = new PF.BestFirstFinder();

    return finder.findPath(startX, startY, endX, endY, grid);
  }

  /**
   * Move the selected character to the coordinates.
   * @param {Number} endX x coordinate to move the selected character to.
   * @param {Number} endY y coordinate to move the selected character to.
   */
  public moveCharacterTo(endX: number, endY: number) {
    return new Promise((resolve) => {
      const { layers } = Game.gameMap;

      if (!layers.movement.hasTileAt(endX, endY)) {
        return resolve({ tileUnit: this, moved: false });
      }

      const { layer: { tilemapLayer },
        x: startX, y: startY } = this.tile;

      const deltaToCenter = this.tile.height / 1.4;
      const path = this.getCharacterPath({ startX, startY }, { endX, endY });

      if (path.length === 1) { // start === end
        return resolve({ tileUnit: this, moved: false });
      }

      this.isAnimating = true;

      this.scene.tweens.timeline({
        onComplete: () => {
          this.isAnimating = false;
          resolve({ tileUnit: this, moved: true });
        },
        targets: this.sprite,
        tweens: path.map(([x, y]) => {
          return {
            x: tilemapLayer.tileToWorldX(x) + deltaToCenter,
            y: tilemapLayer.tileToWorldY(y) + deltaToCenter,
            duration: 100,
          };
        }),
      });
    });
  }

  /**
   * Fired when this current unit is selected
   * and pointer has moved.
   */
  public onCursorMoved(cursor: Phaser.Input.Pointer) {
    const movement = Game.gameMap.layers.movement as Phaser.Tilemaps.DynamicTilemapLayer;
    const { selectedCharacter } = Game.gameMap;

    if (!selectedCharacter ||
        !selectedCharacter.properties ||
        !selectedCharacter.properties.tileUnit) {
          return;
    }

    const tileUnit = selectedCharacter.properties.tileUnit as TileUnit;

    const { x: startX, y: startY } = tileUnit.tile;
    const { x: endX, y: endY } = cursor;

    const inRange = tileUnit.tilesMovement
      .some((tile) => tile.x === endX && tile.y === endY );

    if (!inRange) { return; }

    const {
      tileMovementActive: activeColor,
      tileMovementPassive: passiveColor,
    } = gameConst.colors;

    // Revert back past movement tiles to their original tint
    tileUnit.tilesPath.map((tile) => tile.tint = passiveColor);

    tileUnit.tilesPath = tileUnit
      .getCharacterPath({ startX, startY }, { endX, endY })
      .map(([x, y]) => movement.getTileAt(x, y))
      .map((tile) => { tile.tint = activeColor; return tile; });
  }

  /**
   * Remove sprite animation from tile.
   */
  public sendToBack() {
    // Prevent cancelling movement animation
    if (this.isAnimating) { return; }

    this.tile.setAlpha(1);
    this.sprite.setAlpha(0);

    this.scene.tweens.killTweensOf(this.sprite);

    this
      .hideAllowedMovement()
      .hideAttackRange();
  }

  /**
   * Select this unit.
   */
  public select() {
    this.tintAllowedMovement();

    this.scene.events.on('cursorMoved', this.onCursorMoved);

    return this;
  }

  /**
   * Show the allowed movement for the target character tile.
   * @param {Phaser.Tilemaps.Tile} tileCharacter Tile character to move.
   */
  public showAllowedMovement() {
    const { tile } = this;
    const move = this.unit.move;

    if (!move) { return this; }
    if (this.tilesMovement.length > 0) { return this; }

    const coord = {
      x: tile.x,
      y: tile.y,
    };

    const remainingMove = move + 1;

    this.findValidNeighbours({ coord, remainingMove });
    this.fadeInTiles({ tiles: this.tilesMovement });

    return this;
  }

  /**
   * Show character's weapon range.
   * (Consider all current weapons in inventory).
   */
  public showWeaponRange() {
    const range = this.unit.getRange();

    const { tile } = this;

    const unitCoord = {
      x: tile.x,
      y: tile.y,
    };

    const { move } = this.unit;

    if (range.min === 0 && range.max === 0) { return this; }

    const remainingRange = range.max + 1;

    let gap = (range.min - 1) - move;
    gap = Math.max(0, gap);

    // TODO:
    // If unit has no movement
    // Put atk range tiles from unit tile
    // if (this.tilesMovement.length === 0) {
    // }

    const edgeTiles = this.tilesMovement
      .filter((tileMovement) => {
        return this.isEdgeTile(tileMovement);
      })
      .map((edgeTile) => {
        this.findAttackRangeNeighbours({
          coord: { x: edgeTile.x, y: edgeTile.y },
          remainingMove: remainingRange,
        });
      });

    this.fadeInTiles({ tiles: this.tilesAttackRange, options: { alpha: .7 } });

    return this;
  }

  public findAttackRangeNeighbours(params: ParamsFindNeighbours) {
    const { coord: { x, y }, remainingMove } = params;

    if (remainingMove === 0) { return; }

    const { layers } = Game.gameMap;

    const layerAtkRange = layers.attackRange;

    // 1.Bounds check
    if (x >= layerAtkRange.tilemap.width ||
      y >= layerAtkRange.tilemap.height ||
      x < 0 || y < 0) {
      return;
    }

    // 2.Collision Environment check
    if (layers.collision.hasTileAt(x, y)) { return; }

    // 4.Avoid tile duplication
    if (!layerAtkRange.hasTileAt(x, y) &&
        !layers.movement.hasTileAt(x, y)) {

      const tileAtkRange = layerAtkRange.putTileAt(2525, x, y);

      // Alpha will be animate later to show atk range
      tileAtkRange.setAlpha(0);

      this.tilesAttackRange.push(tileAtkRange);
    }

    const newRemainingMove = remainingMove - 1;

    const coordUp     = { x, y: y - 1 };
    const coordDown   = { x, y: y + 1 };
    const coordLeft   = { x: x - 1, y };
    const coordRight  = { x: x + 1, y };

    this.findAttackRangeNeighbours({ coord: coordUp, remainingMove: newRemainingMove});
    this.findAttackRangeNeighbours({ coord: coordDown, remainingMove: newRemainingMove});
    this.findAttackRangeNeighbours({ coord: coordLeft, remainingMove: newRemainingMove});
    this.findAttackRangeNeighbours({ coord: coordRight, remainingMove: newRemainingMove});
  }

  public isEdgeTile(tile: Phaser.Tilemaps.Tile) {
    const coordArray = [
      { x: tile.x, y: tile.y + 1 }, // bottom
      { x: tile.x - 1, y: tile.y }, // left
      { x: tile.x + 1, y: tile.y }, // right
      { x: tile.x, y: tile.y - 1 }, // top
    ];

    const isEdge = coordArray
      .some((coord) => {
        const { tilemap, tilemapLayer } = tile;

        // boundaries check
        if (coord.x > tilemap.width ||
            coord.y > tilemap.height ||
            coord.x < 0 || coord.y < 0) {
          return false;
        }

        if (!tilemapLayer.hasTileAt(coord.x, coord.y)) {
          return true;
        }

        return false;
      });

    return isEdge;
  }

  public tintAllowedMovement() {
    let delay = 0;

    // Double check tile's movement.
    // Can happens if the cursor didn't move on unit before click.
    if (this.tilesMovement.length === 0) {
      this.bringToFront();
      delay = 500;
    }

    this.tilesMovement
      .map((tile) => {
        this.scene.tweens.add({
          alpha     : 1,
          delay,
          duration  : 25,
          targets   : tile,
        });

        delay += 10;
      });

    return this;
  }

  /**
   * Unselect this unit.
   */
  public unselect() {
    this
      .hideAllowedMovement()
      .hideAttackRange();

    this.scene.events.off('cursorMoved', this.onCursorMoved, undefined, false);

    return this;
  }

  /**
   * Reveal the passed array tiles (with animation).
   */
  private fadeInTiles(params: ParamsFadeInTiles) {
    const { options, tiles} = params;

    let alpha = .5;
    let duration = 250;

    if (options) {
      alpha = options.alpha ? options.alpha : alpha;
      duration = options.duration ? options.duration : duration;
    }

    let delay = 0;

    tiles.map((tile) => {
      this.scene.tweens.add({
        alpha,
        delay,
        duration,
        targets: tile,
      });

      delay += 10;
    });

    return this;
  }

  /**
   * Hide the allowed movement of the last selected character.
   */
  private hideAllowedMovement() {
    const layerMovement = Game.gameMap.layers.movement;

    this.tilesMovement.map((tile) => {
      this.scene.tweens.killTweensOf(tile);
      layerMovement.removeTileAt(tile.x, tile.y);
    });

    this.tilesMovement = [];

    return this;
  }

/**
 * Hide the attack range of the last selected character.
 */
  private hideAttackRange() {
    const layerAtkRange = Game.gameMap.layers.attackRange;

    this.tilesAttackRange.map((tile) => {
      this.scene.tweens.killTweensOf(tile);
      layerAtkRange.removeTileAt(tile.x, tile.y);
    });

    this.tilesAttackRange = [];

    return this;
  }
}
